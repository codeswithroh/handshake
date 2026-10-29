/**
 * /break-it — "Try to cheat Handshake"
 *
 * Each button fires a read-only eth_call simulation (no signing, no tx)
 * against real jobs on the live contract, impersonating the relevant
 * party (eth_call accepts any `from`), then decodes the reverted custom
 * error and shows it as "Refused: ErrorName".
 *
 * Nothing is sent onchain.
 */
import { useState } from 'react'
import { BaseError, ContractFunctionRevertedError, keccak256, toBytes, toHex } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI, JobStatus, type JobStruct } from '../contract'
import { NETWORK } from '../config'
import { publicClient } from '../lib/eventCache'
import { ChainGuard } from '../components/ChainGuard'
import { ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react'
import type { Abi } from 'viem'

// A wallet with no role on any job
const STRANGER = '0x000000000000000000000000000000000000dEaD' as const
const ZERO_REASON = `0x${'00'.repeat(32)}` as const

// ── Target jobs ────────────────────────────────────────────────────
// Attacks run against real, already-settled jobs so the contract's own
// role and status checks are what refuse them.

interface Targets { settled: JobStruct; rejected: JobStruct | null }

let targetsPromise: Promise<Targets> | null = null

async function loadTargets(): Promise<Targets> {
  const count = await publicClient.readContract({
    address: CONTRACT_ADDRESS, abi: CONTRACT_ABI as Abi, functionName: 'jobCount',
  }) as bigint
  let settled: JobStruct | null = null
  let rejected: JobStruct | null = null
  for (let id = 1n; id <= count && (!settled || !rejected); id++) {
    const job = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: CONTRACT_ABI as Abi, functionName: 'getJob', args: [id],
    }) as JobStruct
    if (!settled && job.status === JobStatus.Completed) settled = job
    if (!rejected && job.status === JobStatus.Rejected) rejected = job
  }
  if (!settled) throw new Error('No completed job yet')
  return { settled, rejected }
}

function getTargets(): Promise<Targets> {
  targetsPromise ??= loadTargets().catch((e: unknown) => { targetsPromise = null; throw e })
  return targetsPromise
}

// ── Simulation ─────────────────────────────────────────────────────

type AttackResult = { refused: boolean; error: string }

async function simulate(from: `0x${string}`, functionName: string, args: unknown[]): Promise<AttackResult> {
  try {
    await publicClient.simulateContract({
      address: CONTRACT_ADDRESS, abi: CONTRACT_ABI as Abi, functionName, args, account: from,
    })
    return { refused: false, error: 'Call unexpectedly succeeded' }
  } catch (err: unknown) {
    if (err instanceof BaseError) {
      const revert = err.walk(e => e instanceof ContractFunctionRevertedError)
      if (revert instanceof ContractFunctionRevertedError) {
        return { refused: true, error: revert.data?.errorName ?? revert.signature ?? 'Reverted' }
      }
    }
    // Not a revert (RPC/network failure): surface it rather than score it
    throw err
  }
}

const wrongHash = keccak256(toBytes('definitely not the right content'))
const payload = toHex(toBytes('the actual deliverable'))

// ── Attack definitions ─────────────────────────────────────────────

interface Attack {
  id: string
  label: string
  description: string
  run: (t: Targets) => Promise<AttackResult>
}

const ATTACKS: Attack[] = [
  {
    id: 'stranger-complete',
    label: 'Pay yourself (stranger)',
    description: 'Call complete() on a job from a random wallet that is not the evaluator.',
    run: (t) => simulate(STRANGER, 'complete', [t.settled.id, ZERO_REASON, '0x']),
  },
  {
    id: 'provider-reject-own',
    label: 'Provider rejects own job',
    description: 'Call reject() from the provider address. Only the evaluator may reject.',
    run: (t) => simulate(t.settled.provider, 'reject', [t.settled.id, ZERO_REASON, '0x']),
  },
  {
    id: 'client-complete',
    label: 'Client approves own job',
    description: 'Call complete() from the client. Only the evaluator may approve.',
    run: (t) => simulate(t.settled.client, 'complete', [t.settled.id, ZERO_REASON, '0x']),
  },
  {
    id: 'hijack-submit',
    label: 'Steal the job',
    description: 'Call submit() from a wallet that is not the assigned provider.',
    run: (t) => simulate(STRANGER, 'submit', [t.settled.id, wrongHash, payload]),
  },
  {
    id: 'resubmit-settled',
    label: 'Swap the deliverable after payout',
    description: 'The provider calls submit() again on a job that is already paid.',
    run: (t) => simulate(t.settled.provider, 'submit', [t.settled.id, keccak256(payload), payload]),
  },
  {
    id: 'refund-paid',
    label: 'Refund a paid job',
    description: 'The client calls claimRefund() on a job whose USDC already went to the provider.',
    run: (t) => simulate(t.settled.client, 'claimRefund', [t.settled.id]),
  },
  {
    id: 'double-complete',
    label: 'Double-pay a settled job',
    description: 'The evaluator calls complete() a second time on a Completed job.',
    run: (t) => simulate(t.settled.evaluator, 'complete', [t.settled.id, ZERO_REASON, '0x']),
  },
  {
    id: 'fund-strangers-job',
    label: "Fund someone else's job",
    description: "Call fund() on a job you didn't create. Only the client may fund.",
    run: (t) => simulate(STRANGER, 'fund', [(t.rejected ?? t.settled).id, '0x']),
  },
]

// ── Single attack row ─────────────────────────────────────────────

interface AttackState { status: 'idle' | 'running' | 'refused' | 'passed' | 'error'; error: string }

function AttackRow({
  attack,
  state,
  onRun,
  disabled,
}: {
  attack: Attack
  state: AttackState
  onRun: () => void
  disabled: boolean
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
      style={{
        background: state.status === 'refused' ? 'rgba(34,213,100,0.04)' : state.status === 'passed' ? 'rgba(244,63,94,0.04)' : 'var(--surface)',
        border: `1px solid ${state.status === 'refused' ? 'rgba(34,213,100,0.2)' : state.status === 'passed' ? 'rgba(244,63,94,0.2)' : 'var(--border)'}`,
        transition: 'all 0.3s ease',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{attack.label}</span>
          {state.status === 'refused' && (
            <span className="mono text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(34,213,100,0.15)', color: 'var(--green)' }}>
              Refused: {state.error}
            </span>
          )}
          {state.status === 'passed' && (
            <span className="mono text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(244,63,94,0.15)', color: 'var(--red)' }}>
              Passed through!
            </span>
          )}
          {state.status === 'error' && (
            <span className="mono text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)' }}>
              {state.error}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-2)' }}>{attack.description}</p>
      </div>
      <button
        onClick={onRun}
        disabled={disabled || state.status === 'running'}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', minWidth: '80px', justifyContent: 'center' }}
      >
        {state.status === 'running' ? (
          <><Loader2 size={12} className="animate-spin" /> Running…</>
        ) : state.status === 'refused' ? (
          <><CheckCircle2 size={12} style={{ color: 'var(--green)' }} /> Retry</>
        ) : (
          'Try it'
        )}
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export function BreakItPage() {
  const [states, setStates] = useState<Record<string, AttackState>>({})

  const refused = Object.values(states).filter(s => s.status === 'refused').length
  const allRefused = refused === ATTACKS.length

  async function runAttack(attack: Attack) {
    setStates(prev => ({ ...prev, [attack.id]: { status: 'running', error: '' } }))
    try {
      const result = await attack.run(await getTargets())
      setStates(prev => ({
        ...prev,
        [attack.id]: {
          status: result.refused ? 'refused' : 'passed',
          error: result.error,
        },
      }))
    } catch {
      setStates(prev => ({ ...prev, [attack.id]: { status: 'error', error: 'Network error, try again' } }))
    }
  }

  async function runAll() {
    for (const attack of ATTACKS) {
      await runAttack(attack)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <ChainGuard>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(244,63,94,0.12)' }}>
              <ShieldAlert size={18} style={{ color: 'var(--red)' }} />
            </div>
            <div>
              <h1 className="display font-bold text-3xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Try to cheat Handshake</h1>
            </div>
          </div>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Each button replays a real attack against settled jobs on the live contract as a read-only <span className="mono" style={{ color: 'var(--muted)' }}>eth_call</span>. No wallet, no signature, no gas.
            Every one should be refused by the contract. A green badge shows the exact error it reverted with.
          </p>
        </div>

        {/* Score bar */}
        <div className="rounded-xl p-4 mb-6 flex items-center gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>Attacks refused</span>
              <span className="mono font-bold" style={{ color: allRefused ? 'var(--green)' : 'var(--ink)' }}>
                {refused}/{ATTACKS.length}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-strong)', position: 'relative', overflow: 'visible' }}>
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (refused / ATTACKS.length) * 100)}%`,
                  background: allRefused ? 'var(--green)' : 'var(--amber)',
                  borderRadius: '9999px',
                  position: 'absolute',
                  inset: 0,
                }}
              />
            </div>
          </div>
          <button
            onClick={() => { void runAll() }}
            className="flex-shrink-0 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: 'var(--red)', color: 'white' }}
          >
            Run all {ATTACKS.length}
          </button>
        </div>

        {/* Attack list */}
        <div className="flex flex-col gap-3">
          {ATTACKS.map((attack) => (
            <AttackRow
              key={attack.id}
              attack={attack}
              state={states[attack.id] ?? { status: 'idle', error: '' }}
              onRun={() => { void runAttack(attack) }}
              disabled={false}
            />
          ))}
        </div>

        {allRefused && (
          <div className="mt-6 rounded-xl px-5 py-4 text-center" style={{ background: 'rgba(34,213,100,0.08)', border: '1px solid rgba(34,213,100,0.25)' }}>
            <div className="text-lg font-bold mb-1" style={{ color: 'var(--green)' }}>{ATTACKS.length}/{ATTACKS.length} refused</div>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Every attack was caught. The contract enforced its rules without a single signed transaction.
            </p>
          </div>
        )}

        <p className="text-xs mt-6 text-center" style={{ color: 'var(--muted)' }}>
          All simulations use <span className="mono">eth_call</span> via the {NETWORK.label} RPC. Nothing is broadcast or signed.
        </p>
      </ChainGuard>
    </main>
  )
}
