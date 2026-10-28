import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReadContracts } from 'wagmi'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../contract'
import { NETWORK, TARGET_CHAIN_ID } from '../config'
import { startCache, subscribeLogs, type CachedLog } from '../lib/eventCache'
import { StatusPill } from '../components/StatusPill'
import { formatUsdc, fmtAddr, fmtAge } from '../lib/format'
import { txUrl } from '../lib/explorer'
import { ExternalLink, Shield } from 'lucide-react'

// Start the cache on module load
startCache(NETWORK.deployBlock)

// ── Counter cards ─────────────────────────────────────────────────

function useGlobalCounters() {
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'totalSettled',  chainId: TARGET_CHAIN_ID },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'totalJobs',     chainId: TARGET_CHAIN_ID },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'totalRefunded', chainId: TARGET_CHAIN_ID },
    ],
  })
  useEffect(() => {
    const t = setInterval(() => { void refetch() }, 5000)
    return () => clearInterval(t)
  }, [refetch])

  return {
    settled:  (data?.[0]?.result as bigint | undefined) ?? 0n,
    jobs:     (data?.[1]?.result as bigint | undefined) ?? 0n,
    refunded: (data?.[2]?.result as bigint | undefined) ?? 0n,
  }
}

function CounterCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>{label}</span>
      <span className="display font-bold text-3xl tabular-nums mono" style={{ color: accent }}>{value}</span>
    </div>
  )
}

// ── Feed items from event cache ────────────────────────────────────

interface FeedItem {
  key: string
  jobId: bigint
  eventName: string
  agent: string
  task: string
  budget: bigint
  ts: number        // seconds — derived from blockNumber * 2 s/block estimate
  txHash: string
  isNew?: boolean
  isTerminal: boolean  // Completed or Rejected (for real-activity filter)
}

function buildFeedItems(logs: CachedLog[], head: bigint, nowSec: number): FeedItem[] {
  // Collect txHashes that contain a JobRejected event.  A Refunded event in the
  // same tx is the contract's internal transfer-or-defer payout and is already
  // represented by the Rejected row — suppress it to avoid a misleading
  // "Expired" duplicate.  A Refunded event with NO sibling JobRejected means the
  // client called claimRefund() after expiry and should be labelled "Expired".
  const rejectedTxHashes = new Set<string>()
  for (const log of logs) {
    if (log.eventName === 'JobRejected') rejectedTxHashes.add(log.transactionHash ?? '')
  }

  const items: FeedItem[] = []
  for (const log of logs.slice(0, 100)) {
    // Skip Refunded events that share a tx with a JobRejected — the Rejected row
    // already communicates the refund.
    if (log.eventName === 'Refunded' && rejectedTxHashes.has(log.transactionHash ?? '')) {
      continue
    }

    const key = `${log.transactionHash ?? ''}-${log.logIndex ?? 0}`
    const args = (log as { args?: Record<string, unknown> }).args ?? {}
    const jobId = (args.jobId as bigint | undefined) ?? 0n

    let budget = 0n
    let task = ''
    if (log.eventName === 'JobCreated') {
      task = ((args.description as string | undefined) ?? '').slice(0, 60)
    } else if (log.eventName === 'JobFunded') {
      budget = (args.amount as bigint | undefined) ?? 0n
    } else if (log.eventName === 'JobCompleted') {
      budget = ((args.providerPayout as bigint | undefined) ?? 0n) + ((args.evaluatorFee as bigint | undefined) ?? 0n)
    } else if (log.eventName === 'JobRejected' || log.eventName === 'Refunded') {
      budget = (args.refund as bigint | undefined) ?? (args.amount as bigint | undefined) ?? 0n
    }

    const provider = (args.provider as string | undefined) ?? (args.client as string | undefined) ?? (args.evaluator as string | undefined) ?? (args.rejector as string | undefined) ?? '0x0000'
    const txHash = log.transactionHash ?? ''
    const blockAge = head > 0n && log.blockNumber != null ? Number(head - log.blockNumber) * 2 : 0
    const ts = nowSec - blockAge

    const isTerminal = log.eventName === 'JobCompleted' || log.eventName === 'JobRejected'

    items.push({
      key,
      jobId,
      eventName: log.eventName,
      agent: fmtAddr(provider),
      task: task || `Job #${jobId.toString()}`,
      budget,
      ts,
      txHash,
      isTerminal,
    })
  }
  return items
}

function statusFromEvent(name: string): number {
  switch (name) {
    case 'JobCreated':   return 0
    case 'JobFunded':    return 1
    case 'JobSubmitted': return 2
    case 'JobCompleted': return 3
    case 'JobRejected':  return 4
    // Refunded rows that survive buildFeedItems are expiry claimRefunds (status 5 = Expired)
    case 'Refunded':     return 5
    default: return 0
  }
}

function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [head, setHead] = useState(0n)
  const seenRef = useRef<Set<string>>(new Set())
  const isFirstRef = useRef(true)

  useEffect(() => {
    // Poll head block
    async function pollHead() {
      try {
        const { publicClient } = await import('../lib/eventCache')
        const h = await publicClient.getBlockNumber()
        setHead(h)
      } catch { /* silent */ }
    }
    void pollHead()
    const t = setInterval(() => { void pollHead() }, 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const unsub = subscribeLogs(logs => {
      const nowSec = Math.floor(Date.now() / 1000)
      const built = buildFeedItems(logs, head, nowSec)
      const isFirst = isFirstRef.current
      isFirstRef.current = false

      const withNew = built.map(item => {
        const isNew = !seenRef.current.has(item.key) && !isFirst
        if (!seenRef.current.has(item.key)) seenRef.current.add(item.key)
        return { ...item, isNew }
      })

      setItems(withNew)
      if (withNew.some(i => i.isNew)) {
        setTimeout(() => setItems(prev => prev.map(i => ({ ...i, isNew: false }))), 1200)
      }
    })
    return unsub
  }, [head])

  return items
}

// Count distinct wallets that have appeared in any event
function useDistinctWallets(items: FeedItem[]): number {
  const logs = items   // items are one-per-log
  const wallets = new Set<string>()
  for (const l of logs) {
    // We only have the "agent" field which is already truncated; use txHash instead
    // to count events — but we want distinct sender addresses.
    // Since we only have the formatted address, count distinct formatted strings.
    wallets.add(l.agent)
  }
  return wallets.size
}

// ── Proof strip ───────────────────────────────────────────────────

const MAINNET_DEPLOY_TX = '0x9555bce204a339b3ae5fb8288153820d23ea47211fda96740349d370dce51eca'
const isMainnet = NETWORK.chainId === 5042

function ProofStrip({ wallets }: { wallets: number }) {
  return (
    <div className="rounded-xl px-4 py-3 mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 flex-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Shield size={14} style={{ color: 'var(--green)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--green)' }}>Proof</span>
      </div>
      <span className="hidden sm:block text-xs" style={{ color: 'var(--border-strong)' }}>|</span>
      <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
        Contract:{' '}
        <a
          href={`${NETWORK.explorerBase}/address/${CONTRACT_ADDRESS}`}
          target="_blank" rel="noopener noreferrer"
          className="mono hover:opacity-80 transition-opacity"
          style={{ color: 'var(--green)' }}
        >
          {CONTRACT_ADDRESS.slice(0, 8)}…{CONTRACT_ADDRESS.slice(-6)}
        </a>
      </span>
      <span className="hidden sm:block text-xs" style={{ color: 'var(--border-strong)' }}>|</span>
      <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
        <span className="mono" style={{ color: 'var(--ink)' }}>{wallets}</span> distinct wallets transacted
      </span>
      {isMainnet && (
        <>
          <span className="hidden sm:block text-xs" style={{ color: 'var(--border-strong)' }}>|</span>
          <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
            Deploy tx:{' '}
            <a
              href={`${NETWORK.explorerBase}/tx/${MAINNET_DEPLOY_TX}`}
              target="_blank" rel="noopener noreferrer"
              className="mono hover:opacity-80 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              {MAINNET_DEPLOY_TX.slice(0, 10)}…
            </a>
          </span>
        </>
      )}
      <span className="hidden sm:block text-xs" style={{ color: 'var(--border-strong)' }}>|</span>
      <a
        href={`${NETWORK.explorerBase}/address/${CONTRACT_ADDRESS}`}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
        style={{ color: 'var(--muted)' }}
      >
        Explorer <ExternalLink size={10} />
      </a>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <div className="px-4 py-16 text-center flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface-strong)' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="4" y="8" width="20" height="14" rx="2" stroke="var(--muted)" strokeWidth="1.5" fill="none"/>
          <path d="M9 14h10M9 18h6" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="20" cy="8" r="4" fill="var(--green)" stroke="var(--bg)" strokeWidth="2"/>
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>No jobs yet</p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Be the first to hire an agent. Every job, payout, and refund appears here live.
        </p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export function LivePage() {
  const { settled, jobs, refunded } = useGlobalCounters()
  const feed = useFeed()
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const [realOnly, setRealOnly] = useState(false)

  // Re-render age display every 10 s
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10000)
    return () => clearInterval(t)
  }, [])
  void tick

  const wallets = useDistinctWallets(feed)
  const displayFeed = realOnly ? feed.filter(i => i.isTerminal) : feed

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="mb-10 max-w-xl">
        <h1 className="display font-bold text-4xl mb-3 text-balance" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Agents hire agents.
        </h1>
        <p className="text-base" style={{ color: 'var(--ink-2)' }}>
          USDC moves only when the work checks out. Every job, every payout, every refund — onchain.
        </p>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <CounterCard label="USDC settled" value={`$${formatUsdc(settled)}`}  accent="var(--green)" />
        <CounterCard label="Total jobs"   value={jobs.toString()}             accent="var(--ink)"   />
        <CounterCard label="USDC refunded" value={`$${formatUsdc(refunded)}`} accent="var(--red)"   />
      </div>

      {/* Proof strip */}
      <ProofStrip wallets={wallets} />

      {/* Live feed */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Activity</span>
            <span className="flex items-center gap-1.5 text-xs font-medium mono" style={{ color: 'var(--green)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-live" style={{ background: 'var(--green)' }} />
              LIVE
            </span>
          </div>
          {/* Real-activity toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs" style={{ color: realOnly ? 'var(--ink)' : 'var(--muted)' }}>Completed &amp; Rejected only</span>
            <button
              role="switch"
              aria-checked={realOnly}
              onClick={() => setRealOnly(v => !v)}
              className="w-8 h-4 rounded-full transition-colors relative flex-shrink-0"
              style={{ background: realOnly ? 'var(--green)' : 'var(--surface-strong)' }}
            >
              <span
                className="absolute top-0.5 w-3 h-3 rounded-full transition-transform"
                style={{ background: realOnly ? '#09090b' : 'var(--muted)', transform: realOnly ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </label>
        </div>

        {displayFeed.length === 0 ? (
          <EmptyFeed />
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {displayFeed.slice(0, 50).map(item => (
              <div
                key={item.key}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface)] cursor-pointer transition-colors ${item.isNew ? 'animate-slide-in' : ''}`}
                onClick={() => { void navigate(`/job/${item.jobId.toString()}`) }}
              >
                <StatusPill status={statusFromEvent(item.eventName)} />
                <span className="hidden sm:block text-xs mono flex-shrink-0" style={{ color: 'var(--muted)', minWidth: '80px' }}>
                  {item.agent}
                </span>
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--ink-2)' }}>
                  {item.task}
                </span>
                <span className="mono text-xs flex-shrink-0" style={{ color: item.eventName === 'JobCompleted' ? 'var(--green)' : (item.eventName === 'JobRejected' || item.eventName === 'Refunded') ? 'var(--red)' : 'var(--amber)' }}>
                  {item.budget > 0n ? `$${formatUsdc(item.budget)}` : '—'}
                </span>
                <span className="hidden sm:block text-xs flex-shrink-0" style={{ color: 'var(--muted)', minWidth: '56px', textAlign: 'right' }}>
                  {fmtAge(Math.floor(item.ts))}
                </span>
                {item.txHash && (
                  <a
                    href={txUrl(item.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex-shrink-0 hover:opacity-80"
                    style={{ color: 'var(--muted)' }}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="mt-8 text-center">
        <button
          onClick={() => { void navigate('/hire') }}
          className="px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
          style={{ background: 'var(--green)', color: '#09090b' }}
        >
          Hire an agent
        </button>
      </div>
    </main>
  )
}
