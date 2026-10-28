import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { keccak256, toBytes, type Log } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI, JobStatus, type JobStruct } from '../contract'
import { NETWORK, TARGET_CHAIN_ID } from '../config'
import { publicClient, EVENT_ABIS, startCache } from '../lib/eventCache'
import { StatusPill } from '../components/StatusPill'
import { ChainGuard } from '../components/ChainGuard'
import { formatUsdc, fmtAddr, fmtTs, fmtHash, fmtCountdown } from '../lib/format'
import { txUrl, addrUrl } from '../lib/explorer'
import { parseOnchainError } from '../lib/errors'
import { ExternalLink, CheckCircle, Clock, Zap } from 'lucide-react'
import { toast } from 'sonner'

// Ensure cache is warm
startCache(NETWORK.deployBlock)

// ── Utilities ──────────────────────────────────────────────────────

function decodeOptParams(bytes: `0x${string}`): string {
  if (!bytes || bytes === '0x') return ''
  try {
    return new TextDecoder().decode(Buffer.from(bytes.slice(2), 'hex'))
  } catch {
    return bytes
  }
}

// ── Typewriter hook ────────────────────────────────────────────────

function useTypewriter(full: string, enabled: boolean): string {
  // When disabled, return the full string immediately (no typing animation).
  // cursor tracks how many chars to show; it is driven purely by setInterval, no
  // synchronous setState inside the effect body (which would trigger a lint error).
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (!enabled || !full) return
    let i = 0
    const t = setInterval(() => {
      i += 1
      setCursor(i)
      if (i >= full.length) clearInterval(t)
    }, 18)
    return () => clearInterval(t)
  }, [full, enabled])

  if (!enabled || !full) return full
  return full.slice(0, cursor)
}

// ── Timeline events from cache ─────────────────────────────────────

interface TimelineEvent {
  step: string
  ts: number
  txHash: string
  detail?: string
  accent: string
}

function useJobEvents(jobId: bigint) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [deliverableText, setDeliverableText] = useState('')
  const [verdictText, setVerdictText] = useState('')
  const [fundedAt, setFundedAt] = useState(0)          // unix ts of JobFunded
  const [submittedAt, setSubmittedAt] = useState(0)    // unix ts of JobSubmitted
  const seenSubmit = useRef(false)

  useEffect(() => {
    if (!jobId) return
    let alive = true

    async function load() {
      try {
        const results = await Promise.allSettled([
          publicClient.getLogs({ address: CONTRACT_ADDRESS, event: EVENT_ABIS.JobCreated,   fromBlock: NETWORK.deployBlock, toBlock: 'latest', args: { jobId } }),
          publicClient.getLogs({ address: CONTRACT_ADDRESS, event: EVENT_ABIS.JobFunded,    fromBlock: NETWORK.deployBlock, toBlock: 'latest', args: { jobId } }),
          publicClient.getLogs({ address: CONTRACT_ADDRESS, event: EVENT_ABIS.JobSubmitted, fromBlock: NETWORK.deployBlock, toBlock: 'latest', args: { jobId } }),
          publicClient.getLogs({ address: CONTRACT_ADDRESS, event: EVENT_ABIS.JobCompleted, fromBlock: NETWORK.deployBlock, toBlock: 'latest', args: { jobId } }),
          publicClient.getLogs({ address: CONTRACT_ADDRESS, event: EVENT_ABIS.JobRejected,  fromBlock: NETWORK.deployBlock, toBlock: 'latest', args: { jobId } }),
          publicClient.getLogs({ address: CONTRACT_ADDRESS, event: EVENT_ABIS.Refunded,     fromBlock: NETWORK.deployBlock, toBlock: 'latest', args: { jobId } }),
        ])

        if (!alive) return

        const blockNums = new Set<bigint>()
        results.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(l => l.blockNumber && blockNums.add(l.blockNumber)) })
        const blocks = await Promise.all([...blockNums].map(n => publicClient.getBlock({ blockNumber: n })))
        const tsMap = new Map(blocks.map(b => [b.number, Number(b.timestamp)]))

        const evts: TimelineEvent[] = []

        const created = results[0].status === 'fulfilled' ? results[0].value[0] : null
        if (created) evts.push({ step: 'Created', ts: tsMap.get(created.blockNumber ?? 0n) ?? 0, txHash: created.transactionHash ?? '', accent: 'var(--ink-2)' })

        const funded = results[1].status === 'fulfilled' ? results[1].value[0] : null
        if (funded) {
          const args = (funded as Log & { args?: { amount?: bigint } }).args
          const ts = tsMap.get(funded.blockNumber ?? 0n) ?? 0
          setFundedAt(ts)
          evts.push({ step: 'Funded', ts, txHash: funded.transactionHash ?? '', detail: args?.amount != null ? `$${formatUsdc(args.amount)} USDC escrowed` : '', accent: 'var(--amber)' })
        }

        const submitted = results[2].status === 'fulfilled' ? results[2].value[0] : null
        if (submitted) {
          const args = (submitted as Log & { args?: { optParams?: `0x${string}` } }).args
          const text = decodeOptParams(args?.optParams ?? '0x')
          if (text) setDeliverableText(text)
          const ts = tsMap.get(submitted.blockNumber ?? 0n) ?? 0
          setSubmittedAt(ts)
          evts.push({ step: 'Delivered', ts, txHash: submitted.transactionHash ?? '', accent: 'var(--amber)' })
        }

        const completed = results[3].status === 'fulfilled' ? results[3].value[0] : null
        if (completed) {
          const args = (completed as Log & { args?: { optParams?: `0x${string}`; providerPayout?: bigint; evaluatorFee?: bigint } }).args
          const text = decodeOptParams(args?.optParams ?? '0x')
          if (text) setVerdictText(text)
          const payout = args?.providerPayout != null && args?.evaluatorFee != null ? `$${formatUsdc((args.providerPayout ?? 0n) + (args.evaluatorFee ?? 0n))} paid out` : ''
          evts.push({ step: 'Paid', ts: tsMap.get(completed.blockNumber ?? 0n) ?? 0, txHash: completed.transactionHash ?? '', detail: payout, accent: 'var(--green)' })
        }

        const rejected = results[4].status === 'fulfilled' ? results[4].value[0] : null
        if (rejected) {
          const args = (rejected as Log & { args?: { optParams?: `0x${string}`; refund?: bigint } }).args
          const text = decodeOptParams(args?.optParams ?? '0x')
          if (text) setVerdictText(text)
          const refund = args?.refund != null ? `$${formatUsdc(args.refund)} refunded` : ''
          evts.push({ step: 'Rejected', ts: tsMap.get(rejected.blockNumber ?? 0n) ?? 0, txHash: rejected.transactionHash ?? '', detail: refund, accent: 'var(--red)' })
        }

        // Only show a "Expired · refunded" timeline step when the Refunded event
        // came from a claimRefund() call — i.e. its tx hash is NOT the same as
        // the JobRejected tx (where the Refunded is just the internal payout).
        const rejectedTxHash = rejected?.transactionHash ?? null
        const refunded = results[5].status === 'fulfilled'
          ? results[5].value.find(l => l.transactionHash !== rejectedTxHash)
          : null
        if (refunded) {
          const args = (refunded as Log & { args?: { amount?: bigint } }).args
          evts.push({ step: 'Expired · refunded', ts: tsMap.get(refunded.blockNumber ?? 0n) ?? 0, txHash: refunded.transactionHash ?? '', detail: args?.amount != null ? `$${formatUsdc(args.amount)} returned` : '', accent: 'var(--red)' })
        }

        // Track first arrival of submit for typewriter trigger
        if (submitted && !seenSubmit.current) seenSubmit.current = true

        evts.sort((a, b) => a.ts - b.ts)
        setEvents(evts)
      } catch {
        // silent
      }
    }

    void load()
    const t = setInterval(() => { void load() }, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [jobId])

  return { events, deliverableText, verdictText, fundedAt, submittedAt }
}

// ── Working state: elapsed timer ───────────────────────────────────

function WorkingState({ fundedAt, job }: { fundedAt: number; job: JobStruct }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = fundedAt > 0 ? fundedAt : Math.floor(Date.now() / 1000) - 5
    const update = () => setElapsed(Math.max(0, Math.floor(Date.now() / 1000) - start))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [fundedAt])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
      <div className="flex items-center gap-3">
        {/* Animated indicator */}
        <div className="relative w-8 h-8 flex-shrink-0">
          <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(245,158,11,0.25)' }} />
          <div className="relative w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.2)' }}>
            <Zap size={14} style={{ color: 'var(--amber)' }} />
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>
            {job.provider === '0x0000000000000000000000000000000000000000' ? 'Agent' : fmtAddr(job.provider)} is working…
          </div>
          <div className="mono text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Elapsed: {mm}:{ss}</div>
        </div>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(245,158,11,0.15)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            background: 'var(--amber)',
            width: `${Math.min(100, (elapsed / (15 * 60)) * 100)}%`,
            transition: 'width 1s linear',
          }}
        />
      </div>
      <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
        USDC is locked in escrow. Sentinel will review when the deliverable arrives.
      </p>
    </div>
  )
}

// ── Animated money flow ────────────────────────────────────────────

function Dot({ color, delay }: { color: string; delay: number }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        background: color,
        animation: `moveDot 1.4s ${delay}s ease-in-out infinite`,
        display: 'inline-block',
        marginLeft: '2px',
      }}
    />
  )
}

function MoneyFlow({ job, animating }: { job: JobStruct; animating: 'complete' | 'refund' | 'pending' | 'none' }) {
  const evaluatorFeeBps = 1000n
  const evaluatorFee = job.budget > 0n ? (job.budget * evaluatorFeeBps) / 10000n : 0n
  const providerPayout = job.budget > 0n ? job.budget - evaluatorFee : 0n

  if (job.status === JobStatus.Completed || animating === 'complete') {
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(34,213,100,0.06)', border: '1px solid rgba(34,213,100,0.2)' }}>
        <div className="text-xs uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--green)', letterSpacing: '0.08em' }}>
          <CheckCircle size={10} /> Money flow — settled
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap mb-3">
          <span className="mono px-2 py-1 rounded" style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}>{fmtAddr(job.client)}</span>
          <span style={{ color: 'var(--muted)' }}>→</span>
          <span className="mono px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>
            escrow
            {animating === 'complete' && <><Dot color="var(--green)" delay={0} /><Dot color="var(--green)" delay={0.2} /><Dot color="var(--green)" delay={0.4} /></>}
          </span>
          <span style={{ color: 'var(--muted)' }}>→</span>
          <span className="mono px-2 py-1 rounded" style={{ background: 'rgba(34,213,100,0.1)', color: 'var(--green)' }}>{fmtAddr(job.provider)} 90%</span>
          <span style={{ color: 'var(--muted)' }}>+</span>
          <span className="mono px-2 py-1 rounded" style={{ background: 'rgba(34,213,100,0.08)', color: 'var(--green)' }}>{fmtAddr(job.evaluator)} 10%</span>
        </div>
        <div className="flex gap-4 text-xs mono">
          <span style={{ color: 'var(--green)' }}>Provider: ${formatUsdc(providerPayout)}</span>
          <span style={{ color: 'var(--green)' }}>Sentinel: ${formatUsdc(evaluatorFee)}</span>
        </div>
      </div>
    )
  }

  if (job.status === JobStatus.Rejected || job.status === JobStatus.Expired || animating === 'refund') {
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)' }}>
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--red)', letterSpacing: '0.08em' }}>Money flow — refunded</div>
        <div className="flex items-center gap-2 text-xs flex-wrap mb-2">
          <span className="mono px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>
            escrow
            {animating === 'refund' && <><Dot color="var(--red)" delay={0} /><Dot color="var(--red)" delay={0.2} /><Dot color="var(--red)" delay={0.4} /></>}
          </span>
          <span style={{ color: 'var(--muted)' }}>→</span>
          <span className="mono px-2 py-1 rounded" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--red)' }}>{fmtAddr(job.client)} (refund)</span>
        </div>
        <div className="text-xs mono" style={{ color: 'var(--red)' }}>Full ${formatUsdc(job.budget)} returned</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Money flow (pending)</div>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="mono px-2 py-1 rounded" style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}>{fmtAddr(job.client)}</span>
        <span style={{ color: 'var(--muted)' }}>→</span>
        <span className="mono px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>escrow ${formatUsdc(job.budget)}</span>
        <span style={{ color: 'var(--muted)' }}>→</span>
        <span className="mono px-2 py-1 rounded" style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}>{fmtAddr(job.provider)} or {fmtAddr(job.client)}</span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export function JobPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = id ? BigInt(id) : 0n
  const { isConnected } = useAccount()
  const [verifyState, setVerifyState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [countdown, setCountdown] = useState('')

  // Typewriter: only animate on initial delivery, not on page refresh
  const typewriterArmed = useRef(false)
  const [prevDeliverable, setPrevDeliverable] = useState('')
  const [typewriterActive, setTypewriterActive] = useState(false)

  const { data: rawJob, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getJob',
    args: [jobId],
    chainId: TARGET_CHAIN_ID,
  })
  const job = rawJob as JobStruct | undefined

  const { events, deliverableText, verdictText, fundedAt, submittedAt } = useJobEvents(jobId)

  // Animated money flow state
  const [moneyAnim, setMoneyAnim] = useState<'complete' | 'refund' | 'pending' | 'none'>('none')
  const prevStatus = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!job) return
    const cur = job.status
    const prev = prevStatus.current
    if (prev !== undefined && prev !== cur) {
      if (cur === JobStatus.Completed) {
        setMoneyAnim('complete')
        setTimeout(() => setMoneyAnim('none'), 3000)
      } else if (cur === JobStatus.Rejected || cur === JobStatus.Expired) {
        setMoneyAnim('refund')
        setTimeout(() => setMoneyAnim('none'), 3000)
      }
    }
    prevStatus.current = cur
  }, [job])

  // Determine effective moneyAnim for rendering (settled/rejected use status, animation takes priority during transition)
  const effectiveAnim = useMemo<'complete' | 'refund' | 'pending' | 'none'>(() => {
    if (moneyAnim !== 'none') return moneyAnim
    if (!job) return 'none'
    if (job.status === JobStatus.Completed) return 'none'  // static settled state
    if (job.status === JobStatus.Rejected || job.status === JobStatus.Expired) return 'none'
    if (job.status === JobStatus.Funded) return 'pending'
    if (job.status === JobStatus.Submitted) return 'pending'
    return 'none'
  }, [moneyAnim, job])

  // Typewriter: arm on first deliver, fire when text arrives
  useEffect(() => {
    if (!deliverableText) return
    if (deliverableText !== prevDeliverable) {
      setPrevDeliverable(deliverableText)
      if (!typewriterArmed.current) {
        // first time we see the deliverable this session = page just loaded after submission
        typewriterArmed.current = true
        setTypewriterActive(true)
      }
    }
  }, [deliverableText, prevDeliverable])

  const displayedDeliverable = useTypewriter(deliverableText, typewriterActive)

  // Auto-refresh job state
  useEffect(() => {
    const t = setInterval(() => { void refetch() }, 5000)
    return () => clearInterval(t)
  }, [refetch])

  // Countdown timer
  useEffect(() => {
    if (!job) return
    const update = () => setCountdown(fmtCountdown(Number(job.expiredAt)))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [job])

  // Claim refund
  const { writeContract: claimRefund, data: claimTx, isPending: claimPending } = useWriteContract()
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimTx })
  useEffect(() => { if (claimSuccess) { toast.success('Refund claimed!'); void refetch() } }, [claimSuccess, refetch])
  const [claimError, setClaimError] = useState('')

  function handleClaimRefund() {
    setClaimError('')
    claimRefund({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'claimRefund',
      args: [jobId],
    }, { onError: (e) => setClaimError(parseOnchainError(e)) })
  }

  function verifyDeliverable() {
    if (!job || !deliverableText) return
    const hash = keccak256(toBytes(deliverableText))
    setVerifyState(hash === job.deliverable ? 'ok' : 'fail')
  }

  const isExpirable = useMemo(() => {
    if (!job || job.id === 0n) return false
    const now = BigInt(Math.floor(Date.now() / 1000))
    return (job.status === JobStatus.Funded || job.status === JobStatus.Submitted) && now >= job.expiredAt
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, countdown])

  // Loading / not-found state — useMemo hooks above must come first
  const jobNotFound = !job || job.id === 0n

  if (jobNotFound) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="mono text-2xl mb-3" style={{ color: 'var(--muted)' }}>—</div>
          <p className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>Loading job #{id}…</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>If this job was just created, give it a moment to confirm.</p>
        </div>
      </main>
    )
  }

  const showWorkingState = job.status === JobStatus.Funded && submittedAt === 0
  const statusColor = job.status === JobStatus.Completed ? 'var(--green)' : job.status >= 4 ? 'var(--red)' : 'var(--amber)'

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <ChainGuard>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="mono text-xs" style={{ color: 'var(--muted)' }}>JOB #{job.id.toString()}</span>
              <StatusPill status={job.status} />
            </div>
            <h1 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {job.description.slice(0, 80)}{job.description.length > 80 ? '…' : ''}
            </h1>
          </div>
          <div className="text-right">
            <div className="mono font-bold text-2xl" style={{ color: statusColor }}>
              ${formatUsdc(job.budget)}
            </div>
            <div className="text-xs flex items-center gap-1 justify-end mt-1" style={{ color: 'var(--muted)' }}>
              <Clock size={10} />{countdown}
            </div>
          </div>
        </div>

        {/* Working state */}
        {showWorkingState && (
          <div className="mb-6">
            <WorkingState fundedAt={fundedAt} job={job} />
          </div>
        )}

        {/* Timeline + details grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <div className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Timeline</div>
            {events.length === 0 ? (
              <div className="flex flex-col gap-3">
                {['Created', 'Funded', 'Delivered', 'Reviewed'].map(s => (
                  <div key={s} className="flex items-center gap-3 pl-1 opacity-30">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: 'var(--border)', border: '2px solid var(--bg)' }} />
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>{s}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-2 top-2 bottom-2 w-px" style={{ background: 'var(--border)' }} />
                <div className="flex flex-col gap-5">
                  {events.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3 pl-1">
                      <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 z-10" style={{ background: ev.accent, border: '2px solid var(--bg)' }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--bg)]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{ev.step}</span>
                          {ev.txHash && (
                            <a href={txUrl(ev.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)' }}>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                        {ev.detail && <div className="mono text-xs mt-0.5" style={{ color: ev.accent }}>{ev.detail}</div>}
                        {ev.ts > 0 && <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{fmtTs(ev.ts)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* Addresses */}
            <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {[
                { label: 'Client', addr: job.client },
                { label: 'Provider', addr: job.provider },
                { label: 'Evaluator', addr: job.evaluator },
              ].map(({ label, addr }) => (
                <div key={label} className="flex justify-between items-center py-1.5">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
                  <a href={addrUrl(addr)} target="_blank" rel="noopener noreferrer" className="mono text-xs flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--ink-2)' }}>
                    {fmtAddr(addr)} <ExternalLink size={9} />
                  </a>
                </div>
              ))}
            </div>

            {/* Deliverable — typewriter reveal */}
            {deliverableText && (
              <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Deliverable</span>
                  <div className="flex items-center gap-2">
                    {verifyState === 'ok' && <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--green)' }}><CheckCircle size={10} /> Verified</span>}
                    {verifyState === 'fail' && <span className="text-xs" style={{ color: 'var(--red)' }}>Hash mismatch</span>}
                    <button onClick={verifyDeliverable} className="text-xs px-2 py-0.5 rounded hover:opacity-80 transition-opacity" style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}>
                      Verify onchain
                    </button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap text-pretty" style={{ color: 'var(--ink)' }}>
                  {displayedDeliverable}
                  {typewriterActive && displayedDeliverable.length < deliverableText.length && (
                    <span className="inline-block w-0.5 h-4 ml-px align-middle animate-pulse" style={{ background: 'var(--green)' }} />
                  )}
                </p>
                <div className="mono text-xs mt-2 truncate" style={{ color: 'var(--muted)' }}>
                  keccak256: {fmtHash(job.deliverable)}
                </div>
              </div>
            )}

            {/* Verdict */}
            {verdictText && (
              <div className="rounded-xl p-4" style={{ background: job.status === JobStatus.Completed ? 'rgba(34,213,100,0.05)' : 'rgba(244,63,94,0.05)', border: `1px solid ${job.status === JobStatus.Completed ? 'rgba(34,213,100,0.2)' : 'rgba(244,63,94,0.2)'}` }}>
                <div className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: job.status === JobStatus.Completed ? 'var(--green)' : 'var(--red)', letterSpacing: '0.08em' }}>
                  {job.status === JobStatus.Completed ? <Zap size={10} /> : null}
                  {job.status === JobStatus.Completed ? 'Evaluator verdict — Approved' : 'Evaluator verdict — Rejected'}
                </div>
                <p className="text-sm text-pretty" style={{ color: 'var(--ink)' }}>{verdictText}</p>
              </div>
            )}

            {/* Money flow */}
            <MoneyFlow job={job} animating={effectiveAnim} />
          </div>
        </div>

        {/* Claim refund */}
        {isExpirable && isConnected && (
          <div className="mt-4">
            {claimError && <p className="text-sm mb-2" style={{ color: 'var(--red)' }}>{claimError}</p>}
            <button
              onClick={handleClaimRefund}
              disabled={claimPending || claimConfirming}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--red)', color: 'white' }}
            >
              {claimPending ? 'Confirm in wallet…' : claimConfirming ? 'Claiming…' : 'Claim refund'}
            </button>
          </div>
        )}
      </ChainGuard>
    </main>
  )
}


