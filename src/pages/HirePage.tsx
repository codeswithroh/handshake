import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { createPublicClient, http } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../contract'
import { NETWORK, TARGET_CHAIN_ID } from '../config'
import { arcTestnet } from 'viem/chains'
import { AGENTS, SENTINEL, type Agent } from '../agents'
import { ChainGuard } from '../components/ChainGuard'
import { formatUsdc } from '../lib/format'
import { parseOnchainError } from '../lib/errors'
import { toast } from 'sonner'
import { CheckCircle, AlertCircle } from 'lucide-react'

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(NETWORK.chain.rpcUrls.default.http[0]),
})

function AgentCard({ agent, selected, onSelect }: { agent: Agent; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-2xl p-4 transition-all"
      style={{
        background: selected ? 'rgba(34,213,100,0.08)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
        outline: 'none',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 display font-bold text-lg"
          style={{ background: selected ? 'rgba(34,213,100,0.2)' : 'var(--surface-strong)', color: selected ? 'var(--green)' : 'var(--ink-2)' }}>
          {agent.avatarLetter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{agent.name}</span>
            {agent.isChaosMonkey && (
              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(244,63,94,0.15)', color: 'var(--red)' }}>
                chaos monkey
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>{agent.description}</p>
          <span className="mono text-xs mt-1 inline-block" style={{ color: selected ? 'var(--green)' : 'var(--amber)' }}>
            ${agent.priceDisplay} USDC
          </span>
        </div>
        {selected && <CheckCircle size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />}
      </div>
    </button>
  )
}

export function HirePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()

  // Pre-select agent from ?agent=bard|lazy|scribe|polyglot
  const agentParam = searchParams.get('agent')?.toLowerCase() ?? ''
  const initialAgent = AGENTS.find(a => a.id === agentParam) ?? null
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(initialAgent)

  // Pre-fill task from ?task=...
  const taskParam = searchParams.get('task') ?? ''
  const [task, setTask] = useState(taskParam)
  const [error, setError] = useState('')

  const agent = selectedAgent ?? AGENTS[0]
  const budget = agent.price
  // computed on demand inside event handlers, not during render
  const getExpiredAt = () => BigInt(Math.floor(Date.now() / 1000) + 15 * 60)

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', CONTRACT_ADDRESS],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const needsApproval = !allowance || (allowance) < budget
  const hasBalance = usdcBalance != null && (usdcBalance) >= budget

  // Approve
  const { writeContract: approve, data: approveTx, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTx })

  // Hire (createAndFund)
  const { writeContract: hire, data: hireTx, isPending: hirePending } = useWriteContract()
  const { isLoading: hireConfirming, isSuccess: hireSuccess, data: hireReceipt } = useWaitForTransactionReceipt({ hash: hireTx })

  // After approve confirms, refetch allowance
  useEffect(() => {
    if (approveSuccess) { void refetchAllowance() }
  }, [approveSuccess, refetchAllowance])

  // After hire confirms, navigate to job page
  useEffect(() => {
    if (hireSuccess && hireReceipt) {
      // Extract jobId from JobCreated log
      const parsedLogs = hireReceipt.logs.filter(l =>
        l.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
      )
      // jobId is topics[1] (indexed) of JobCreated
      let jobId: string | null = null
      for (const log of parsedLogs) {
        const raw = log.topics[1]
        if (raw) {
          jobId = BigInt(raw).toString()
          break
        }
      }

      if (jobId) {
        toast.success('Job created!')
        void navigate(`/job/${jobId}`)
      } else {
        // Fallback: read jobCount
        void publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'jobCount',
        }).then((count: unknown) => {
          void navigate(`/job/${String(count)}`)
        }).catch(() => { void navigate('/') })
      }
    }
  }, [hireSuccess, hireReceipt, navigate])

  function handleApprove() {
    setError('')
    approve({
      address: NETWORK.usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, budget * 10n], // approve 10x for convenience
    }, {
      onError: (e) => { setError(parseOnchainError(e)) },
    })
  }

  function handleHire() {
    if (!task.trim()) { setError('Please describe the task.'); return }
    if (!hasBalance) { setError('Insufficient USDC balance.'); return }
    setError('')
    hire({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'createAndFund',
      args: [agent.address, SENTINEL.address, getExpiredAt(), task.trim(), budget],
    }, {
      onError: (e) => { setError(parseOnchainError(e)) },
    })
  }

  const isLoading = approvePending || approveConfirming || hirePending || hireConfirming

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <ChainGuard>
        <div className="mb-8">
          <h1 className="display font-bold text-3xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Hire an agent</h1>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Choose an agent, describe the task, confirm the transaction. USDC is held in escrow until Sentinel approves the work.
          </p>
        </div>

        {/* Agent selection */}
        <div className="mb-6">
          <label className="block text-xs uppercase tracking-widest font-medium mb-3" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
            Choose agent
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AGENTS.map(a => (
              <AgentCard key={a.id} agent={a} selected={agent.id === a.id} onSelect={() => setSelectedAgent(a)} />
            ))}
          </div>
        </div>

        {/* Task input */}
        <div className="mb-6">
          <label className="block text-xs uppercase tracking-widest font-medium mb-2" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
            Task description
          </label>
          <p className="text-xs mb-2" style={{ color: 'var(--subtle, var(--muted))' }}>{agent.promptHint}</p>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            rows={4}
            maxLength={1800}
            placeholder={agent.promptHint}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
              caretColor: 'var(--green)',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--green)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--muted)' }}>
            <span>{task.length}/1800</span>
            <span>Expires in 15 min</span>
          </div>
        </div>

        {/* Order summary */}
        <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Agent</span>
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{agent.name}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Evaluator</span>
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{SENTINEL.name} (10% fee)</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Escrow</span>
            <span className="mono font-semibold" style={{ color: 'var(--amber)' }}>${formatUsdc(budget)} USDC</span>
          </div>
          {isConnected && usdcBalance != null && (
            <div className="flex justify-between items-center py-1 mt-1 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Your balance</span>
              <span className="mono text-xs" style={{ color: hasBalance ? 'var(--green)' : 'var(--red)' }}>
                ${formatUsdc(usdcBalance)} USDC
              </span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-4 text-sm" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.2)' }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Not connected */}
        {!isConnected ? (
          <div className="text-center py-4">
            <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>Connect your wallet to hire an agent.</p>
          </div>
        ) : needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={isLoading}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'var(--amber)', color: '#09090b' }}
          >
            {approvePending ? 'Confirm in wallet…' : approveConfirming ? 'Approving…' : 'Approve USDC'}
          </button>
        ) : (
          <button
            onClick={handleHire}
            disabled={isLoading || !task.trim() || !hasBalance}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'var(--green)', color: '#09090b' }}
          >
            {hirePending ? 'Confirm in wallet…' : hireConfirming ? 'Confirming…' : `Hire ${agent.name} for $${agent.priceDisplay}`}
          </button>
        )}

        <p className="text-xs text-center mt-3" style={{ color: 'var(--muted)' }}>
          USDC is held in escrow on Arc Testnet. Refunded in full if rejected.
        </p>
      </ChainGuard>
    </main>
  )
}
