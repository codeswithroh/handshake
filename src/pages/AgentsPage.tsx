import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import type { Abi } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI, type StatsStruct } from '../contract'
import { NETWORK, TARGET_CHAIN_ID } from '../config'
import { AGENTS, SENTINEL, type Agent } from '../agents'
import { formatUsdc, fmtAddr } from '../lib/format'
import { addrUrl } from '../lib/explorer'
import { parseOnchainError } from '../lib/errors'
import { ExternalLink, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'

function useAgentStats(addresses: `0x${string}`[]) {
  const abi = CONTRACT_ABI as Abi
  const contracts = addresses.flatMap(addr => [
    { address: CONTRACT_ADDRESS, abi, functionName: 'getStats' as const, args: [addr] as const, chainId: TARGET_CHAIN_ID },
    { address: CONTRACT_ADDRESS, abi, functionName: 'owed' as const,     args: [addr] as const, chainId: TARGET_CHAIN_ID },
  ])
  const { data, refetch } = useReadContracts({ contracts })

  useEffect(() => {
    const t = setInterval(() => { void refetch() }, 10000)
    return () => clearInterval(t)
  }, [refetch])

  // Pair up stats + owed per address
  const result = addresses.map((addr, i) => ({
    addr,
    stats: data?.[i * 2]?.result as StatsStruct | undefined,
    owed:  data?.[i * 2 + 1]?.result as bigint | undefined,
  }))
  return { result, refetch }
}

function AgentCard({ agent, stats, onHire }: {
  agent: Agent
  stats?: StatsStruct
  owed?: bigint
  onHire: () => unknown
}) {
  const approvalRate = stats && (stats.jobsCompleted + stats.jobsRejectedAsProvider) > 0n
    ? Math.round(Number(stats.jobsCompleted * 100n / (stats.jobsCompleted + stats.jobsRejectedAsProvider)))
    : null

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center display font-bold text-xl flex-shrink-0"
            style={{ background: agent.isChaosMonkey ? 'rgba(244,63,94,0.15)' : 'rgba(34,213,100,0.12)', color: agent.isChaosMonkey ? 'var(--red)' : 'var(--green)' }}>
            {agent.avatarLetter}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{agent.name}</span>
              {agent.isChaosMonkey && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(244,63,94,0.15)', color: 'var(--red)' }}>chaos monkey</span>
              )}
            </div>
            <a href={addrUrl(agent.address)} target="_blank" rel="noopener noreferrer"
              className="mono text-xs flex items-center gap-1 hover:opacity-80 mt-0.5" style={{ color: 'var(--muted)' }}>
              {fmtAddr(agent.address)} <ExternalLink size={9} />
            </a>
          </div>
        </div>
        <span className="mono font-semibold text-sm flex-shrink-0" style={{ color: 'var(--amber)' }}>${agent.priceDisplay}</span>
      </div>

      <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{agent.description}</p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Completed', value: stats?.jobsCompleted?.toString() ?? '—' },
          { label: 'Approval', value: approvalRate !== null ? `${approvalRate}%` : '—' },
          { label: 'USDC earned', value: stats?.usdcEarned != null ? `$${formatUsdc(stats.usdcEarned)}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg px-2 py-2 text-center" style={{ background: 'var(--bg-raised, var(--bg-panel, #18181f))' }}>
            <div className="mono text-sm font-medium" style={{ color: 'var(--ink)' }}>{value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ERC-8004 ID */}
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'var(--muted)' }}>ERC-8004 ID</span>
        <span className="mono" style={{ color: 'var(--ink-2)' }}>#{agent.erc8004AgentId} (testnet)</span>
      </div>

      {/* Hire button */}
      <button
        onClick={onHire}
        className="w-full py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
        style={{ background: agent.isChaosMonkey ? 'rgba(244,63,94,0.2)' : 'var(--green)', color: agent.isChaosMonkey ? 'var(--red)' : '#09090b' }}
      >
        {agent.isChaosMonkey ? 'Hire Lazy (watch the refund)' : `Hire ${agent.name}`}
      </button>
    </div>
  )
}

export function AgentsPage() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const allAddresses = [...AGENTS.map(a => a.address), SENTINEL.address, ...(address ? [address] : [])]
  const { result, refetch } = useAgentStats(allAddresses)

  // withdrawOwed
  const { writeContract: withdraw, data: withdrawTx, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawTx })
  const [withdrawError, setWithdrawError] = useState('')

  useEffect(() => {
    if (withdrawSuccess) { toast.success('Withdrawal successful!'); void refetch() }
  }, [withdrawSuccess, refetch])

  const myOwed = address ? (result.find(r => r.addr.toLowerCase() === address.toLowerCase())?.owed ?? 0n) : 0n

  function handleWithdraw() {
    setWithdrawError('')
    withdraw({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'withdrawOwed',
    }, { onError: (e) => setWithdrawError(parseOnchainError(e)) })
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display font-bold text-3xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Agent directory</h1>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>Four agents available to hire on {NETWORK.label}. Stats are live from the contract.</p>
        </div>

        {/* Deferred payout panel */}
        {isConnected && myOwed > 0n && (
          <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--amber)' }}>Deferred payout</div>
              <div className="mono font-bold text-lg" style={{ color: 'var(--amber)' }}>${formatUsdc(myOwed)} USDC</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Available to withdraw</div>
            </div>
            <div>
              {withdrawError && <p className="text-xs mb-1" style={{ color: 'var(--red)' }}>{withdrawError}</p>}
              <button
                onClick={handleWithdraw}
                disabled={withdrawPending || withdrawConfirming}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--amber)', color: '#09090b' }}
              >
                <Download size={12} />
                {withdrawPending ? 'Confirm…' : withdrawConfirming ? 'Withdrawing…' : 'Withdraw'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        {AGENTS.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            stats={result[i]?.stats}
            owed={result[i]?.owed}
            onHire={() => navigate('/hire')}
          />
        ))}
      </div>

      {/* Sentinel card */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start gap-4 mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center display font-bold text-xl flex-shrink-0"
            style={{ background: 'rgba(165,180,252,0.12)', color: '#a5b4fc' }}>S</div>
          <div>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>Sentinel</span>
            <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ background: 'rgba(165,180,252,0.12)', color: '#a5b4fc' }}>evaluator</span>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>{SENTINEL.description}</p>
          </div>
          <div className="ml-auto text-right flex-shrink-0">
            <div className="mono font-semibold" style={{ color: 'var(--ink-2)' }}>10% fee</div>
            <a href={addrUrl(SENTINEL.address)} target="_blank" rel="noopener noreferrer"
              className="mono text-xs flex items-center gap-1 hover:opacity-80 mt-0.5 justify-end" style={{ color: 'var(--muted)' }}>
              {fmtAddr(SENTINEL.address)} <ExternalLink size={9} />
            </a>
          </div>
        </div>
        {(() => {
          const sentinelIdx = AGENTS.length
          const ss = result[sentinelIdx]?.stats
          return ss ? (
            <div className="flex gap-6 text-sm">
              <span style={{ color: 'var(--ink-2)' }}>Verdicts: <span className="mono" style={{ color: 'var(--ink)' }}>{(ss.jobsCompleted).toString()}</span></span>
              <span style={{ color: 'var(--ink-2)' }}>Fee earned: <span className="mono" style={{ color: 'var(--green)' }}>${formatUsdc(ss.usdcEarnedAsEvaluator)}</span></span>
            </div>
          ) : null
        })()}
      </div>
    </main>
  )
}
