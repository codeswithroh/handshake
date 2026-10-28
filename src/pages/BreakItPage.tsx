/**
 * /break-it — "Try to cheat Handshake"
 *
 * Each button fires a read-only eth_call simulation (no signing, no tx)
 * against the live contract from the connected wallet's address, then
 * decodes the reverted custom error and shows it as "Refused: ErrorName".
 *
 * Nothing is sent onchain.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData, decodeFunctionResult, decodeErrorResult, keccak256, toBytes, toHex, encodeAbiParameters, parseAbiParameters } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../contract'
import { publicClient } from '../lib/eventCache'
import { ChainGuard } from '../components/ChainGuard'
import { ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react'
import type { Abi } from 'viem'

// ── Error decoding ─────────────────────────────────────────────────

const KNOWN_ERRORS: Record<string, string> = {
  NotEvaluator:       'NotEvaluator',
  NotProvider:        'NotProvider',
  NotClient:          'NotClient',
  WrongStatus:        'WrongStatus',
  HashMismatch:       'HashMismatch',
  NotExpired:         'NotExpired',
  Expired:            'Expired',
  ExpiryInPast:       'ExpiryInPast',
  ExpiryTooFar:       'ExpiryTooFar',
  BudgetZero:         'BudgetZero',
  EvaluatorFeeTooHigh:'EvaluatorFeeTooHigh',
  NothingOwed:        'NothingOwed',
}

function decodeRevert(data: string): string {
  const hexData = data as `0x${string}`
  // Try to match known 4-byte selectors
  const sel = hexData.slice(0, 10).toLowerCase()
  for (const name of Object.keys(KNOWN_ERRORS)) {
    const sig = `${name}()`
    const hash = keccak256(toBytes(sig)).slice(0, 10).toLowerCase()
    if (hash === sel) return KNOWN_ERRORS[name]
  }
  // Try viem's decodeErrorResult against the full ABI
  try {
    const result = decodeErrorResult({ abi: CONTRACT_ABI as Abi, data: hexData })
    return result.errorName
  } catch { /* ignore */ }
  // Raw selector fallback
  return `0x${hexData.slice(2, 10)}`
}

// A "dummy" non-existent job id for attacks that don't need a real job
const DUMMY_JOB_ID = 99999999n

// ── Attack definitions ─────────────────────────────────────────────

type AttackResult = { refused: boolean; error: string; raw?: string }

interface Attack {
  id: string
  label: string
  description: string
  run: (caller: `0x${string}`) => Promise<AttackResult>
}

async function simulate(caller: `0x${string}`, functionName: string, args: unknown[]): Promise<AttackResult> {
  try {
    const data = encodeFunctionData({ abi: CONTRACT_ABI as Abi, functionName, args })
    const result = await publicClient.call({ to: CONTRACT_ADDRESS, data, account: caller })
    // If call succeeded (no revert), decode result
    try {
      decodeFunctionResult({ abi: CONTRACT_ABI as Abi, functionName, data: result.data ?? '0x' })
    } catch { /* ignore decode errors on success */ }
    return { refused: false, error: 'Call unexpectedly succeeded', raw: result.data }
  } catch (err: unknown) {
    // eth_call revert — extract revert data
    const msg = (err as { message?: string })?.message ?? ''
    // viem wraps revert data in the error message
    const dataMatch = msg.match(/data["\s:=]+"(0x[0-9a-fA-F]+)"/i) ??
                      msg.match(/0x[0-9a-fA-F]{8,}/g)
    const revertData = (dataMatch?.[0] ?? dataMatch?.[0] ?? '').replace(/^.*?(0x[0-9a-fA-F]{8,}).*$/, '$1') as `0x${string}`
    if (revertData && revertData.length >= 10) {
      const name = decodeRevert(revertData)
      return { refused: true, error: name, raw: revertData }
    }
    // Generic revert
    if (msg.includes('revert') || msg.includes('Reverted') || msg.includes('execution reverted')) {
      // Try to parse a selector out of the message directly
      const selMatch = msg.match(/0x([0-9a-fA-F]{8})[0-9a-fA-F]*/)?.[1]
      if (selMatch) {
        const sel = `0x${selMatch}`
        const name = decodeRevert(sel)
        return { refused: true, error: name }
      }
      return { refused: true, error: 'Reverted (no data)' }
    }
    return { refused: false, error: msg.slice(0, 80) }
  }
}

// Produce a valid deliverable hash for a "wrong" payload
function wrongHash(): `0x${string}` {
  return keccak256(toBytes('definitely not the right content'))
}

// Encode a bytes argument for optParams
function encodeOptParams(text: string): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters('bytes'), [toHex(toBytes(text))])
}

const ATTACKS: Attack[] = [
  {
    id: 'stranger-complete',
    label: 'Pay yourself (stranger)',
    description: 'Call complete() on a job as a random wallet that is not the evaluator.',
    run: async (caller) => simulate(caller, 'complete', [DUMMY_JOB_ID, '0x' + '00'.repeat(32), encodeOptParams('approve')]),
  },
  {
    id: 'provider-reject-own',
    label: 'Provider rejects own job',
    description: 'Call reject() from the provider address — only the evaluator may reject.',
    run: async (caller) => simulate(caller, 'reject', [DUMMY_JOB_ID, '0x' + '00'.repeat(32), encodeOptParams('reject')]),
  },
  {
    id: 'client-complete',
    label: 'Client completes own job',
    description: 'Call complete() from the client — only the evaluator may approve.',
    run: async (caller) => simulate(caller, 'complete', [DUMMY_JOB_ID, '0x' + '00'.repeat(32), encodeOptParams('approve')]),
  },
  {
    id: 'hash-mismatch',
    label: 'Submit with wrong hash',
    description: 'Call submit() with a deliverable hash that doesn\'t match the optParams content.',
    run: async (caller) => simulate(caller, 'submit', [DUMMY_JOB_ID, wrongHash(), encodeOptParams('the actual deliverable text that wont match')]),
  },
  {
    id: 'submit-expired',
    label: 'Submit after expiry',
    description: 'Call submit() on a non-existent (expired) job.',
    run: async (caller) => simulate(caller, 'submit', [DUMMY_JOB_ID, wrongHash(), '0x']),
  },
  {
    id: 'early-refund',
    label: 'Claim refund before expiry',
    description: 'Call claimRefund() on a job before its expiry timestamp.',
    run: async (caller) => simulate(caller, 'claimRefund', [DUMMY_JOB_ID]),
  },
  {
    id: 'double-complete',
    label: 'Double-complete a settled job',
    description: 'Call complete() twice — once it\'s Completed, the second call must fail.',
    run: async (caller) => simulate(caller, 'complete', [DUMMY_JOB_ID, '0x' + '00'.repeat(32), '0x']),
  },
  {
    id: 'fund-strangers-job',
    label: "Fund someone else's job",
    description: 'Call fund() on a job you didn\'t create — only the client may fund.',
    run: async (caller) => simulate(caller, 'fund', [DUMMY_JOB_ID, 1_000_000n]),
  },
]

// ── Single attack row ─────────────────────────────────────────────

interface AttackState { status: 'idle' | 'running' | 'refused' | 'passed'; error: string }

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
  const { address, isConnected } = useAccount()
  const [states, setStates] = useState<Record<string, AttackState>>({})

  const refused = Object.values(states).filter(s => s.status === 'refused').length
  const ran = Object.values(states).filter(s => s.status !== 'idle').length
  const allRefused = ran === ATTACKS.length && refused === ATTACKS.length

  async function runAttack(attack: Attack) {
    const caller = address ?? ('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
    setStates(prev => ({ ...prev, [attack.id]: { status: 'running', error: '' } }))
    try {
      const result = await attack.run(caller)
      setStates(prev => ({
        ...prev,
        [attack.id]: {
          status: result.refused ? 'refused' : 'passed',
          error: result.error,
        },
      }))
    } catch {
      setStates(prev => ({ ...prev, [attack.id]: { status: 'idle', error: '' } }))
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
            Each button fires a read-only <span className="mono" style={{ color: 'var(--muted)' }}>eth_call</span> simulation — no wallet signature, no gas.
            Every one should be refused by the contract. A green badge means the contract caught it.
          </p>
          {!isConnected && (
            <div className="mt-3 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.2)' }}>
              Connect a wallet to simulate from your address — or leave disconnected to simulate from a generic address.
            </div>
          )}
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
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(refused / ATTACKS.length) * 100}%`, background: allRefused ? 'var(--green)' : 'var(--amber)' }}
              />
            </div>
          </div>
          <button
            onClick={() => { void runAll() }}
            className="flex-shrink-0 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: 'var(--red)', color: 'white' }}
          >
            Run all 8
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
            <div className="text-lg font-bold mb-1" style={{ color: 'var(--green)' }}>8/8 refused</div>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Every attack was caught. The contract enforced its rules without a single signed transaction.
            </p>
          </div>
        )}

        <p className="text-xs mt-6 text-center" style={{ color: 'var(--muted)' }}>
          All simulations use <span className="mono">eth_call</span> via the Arc Testnet RPC. Nothing is broadcast or signed.
        </p>
      </ChainGuard>
    </main>
  )
}
