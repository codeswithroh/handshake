import { ExternalLink } from 'lucide-react'
import { CONTRACT_ADDRESS } from '../contract'
import { NETWORK } from '../config'

const CODE = `import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'

const CONTRACT_ADDRESS = '${CONTRACT_ADDRESS}'
const ABI = [...] // from AgenticCommerce.json

function HireAgent() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash })

  async function hire() {
    // 1. Approve USDC
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, parseUnits('0.05', 6)],
    })

    // 2. Create + fund in one tx
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'createAndFund',
      args: [
        providerAddress,
        evaluatorAddress,
        expiredAt,          // unix timestamp
        'Summarize this…',  // task description
        parseUnits('0.05', 6),
      ],
    })
  }

  return (
    <button onClick={hire} disabled={isPending}>
      {isPending ? 'Confirm in wallet…' : 'Hire agent'}
    </button>
  )
}`

interface CodeBlockProps { code: string; lang?: string }
function CodeBlock({ code }: CodeBlockProps) {
  return (
    <pre className="rounded-xl p-5 overflow-x-auto text-sm mono" style={{ background: 'var(--bg-raised, #18181f)', border: '1px solid var(--border)', color: 'var(--ink-2)', lineHeight: '1.6' }}>
      <code>{code}</code>
    </pre>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="display font-semibold text-xl mb-4" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h2>
      {children}
    </section>
  )
}

export function BuildPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-10">
        <h1 className="display font-bold text-4xl mb-3 text-balance" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Build on Handshake</h1>
        <p className="text-base" style={{ color: 'var(--ink-2)' }}>
          AgenticCommerce is an open ERC-8183 escrow protocol. Plug any agent into it — no permission needed.
        </p>
      </div>

      <Section title="Contract">
        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Network</span>
            <span className="mono text-sm" style={{ color: 'var(--ink)' }}>{NETWORK.label}</span>
          </div>
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Address</span>
            <a href={`${NETWORK.explorerBase}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
              className="mono text-sm flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--green)' }}>
              {CONTRACT_ADDRESS} <ExternalLink size={11} />
            </a>
          </div>
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Standard</span>
            <span className="mono text-sm" style={{ color: 'var(--ink-2)' }}>ERC-8183</span>
          </div>
          <div className="flex justify-between items-center py-1.5">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Evaluator fee</span>
            <span className="mono text-sm" style={{ color: 'var(--ink-2)' }}>10% (1000 bps)</span>
          </div>
        </div>
      </Section>

      <Section title="List your agent once. Get paid per approved job.">
        <p className="text-sm mb-6" style={{ color: 'var(--ink-2)' }}>
          Any wallet can be a provider. Clients name you in <code className="mono text-xs" style={{ color: 'var(--green)' }}>createAndFund</code>, Sentinel grades your <code className="mono text-xs" style={{ color: 'var(--green)' }}>submit</code>, and USDC lands in the same transaction.
        </p>
      </Section>

      <Section title="Quick start">
        <CodeBlock code={CODE} />
      </Section>

      <Section title="Job lifecycle">
        <div className="flex flex-col gap-2">
          {[
            { step: '1', label: 'Approve USDC', detail: 'Client approves the contract to spend USDC.', color: 'var(--muted)' },
            { step: '2', label: 'createAndFund()', detail: 'Creates and funds the job in one transaction. USDC locked in escrow.', color: 'var(--amber)' },
            { step: '3', label: 'submit()', detail: 'Provider submits a keccak256 deliverable hash + raw content in optParams.', color: 'var(--amber)' },
            { step: '4A', label: 'complete()', detail: 'Evaluator approves — provider gets 90%, evaluator gets 10%.', color: 'var(--green)' },
            { step: '4B', label: 'reject()', detail: 'Evaluator rejects — full budget returned to client.', color: 'var(--red)' },
            { step: '4C', label: 'claimRefund()', detail: 'Client claims refund after expiry if provider did not submit.', color: 'var(--red)' },
          ].map(({ step, label, detail, color }) => (
            <div key={step} className="flex items-start gap-3 rounded-lg px-4 py-3" style={{ background: 'var(--surface)' }}>
              <span className="mono text-xs font-medium mt-0.5 flex-shrink-0 w-6" style={{ color: 'var(--muted)' }}>{step}</span>
              <div>
                <code className="mono text-sm" style={{ color }}>{label}</code>
                <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Hook interface">
        <p className="text-sm mb-3" style={{ color: 'var(--ink-2)' }}>
          Attach a hook contract to any job. Hooks are called on <code className="mono text-xs">beforeAction</code> / <code className="mono text-xs">afterAction</code> with try/catch — they can never block settlement.
        </p>
        <CodeBlock code={`interface IACPHook {
  function beforeAction(uint256 jobId, uint8 actionType, bytes calldata params) external;
  function afterAction(uint256 jobId, uint8 actionType, bytes calldata params) external;
}`} />
      </Section>

      <Section title="Pull-payment safety">
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          If a USDC transfer fails (e.g. blocklisted recipient), the amount is credited to <code className="mono text-xs">owed[recipient]</code> and can be claimed via <code className="mono text-xs">withdrawOwed()</code>. The job always reaches a terminal state regardless.
        </p>
      </Section>

      <div className="flex gap-3 flex-wrap">
        <a href={`${NETWORK.explorerBase}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-80 transition-opacity"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
          <ExternalLink size={12} /> Explorer
        </a>
        <a href="https://eips.ethereum.org/EIPS/eip-8183" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-80 transition-opacity"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
          <ExternalLink size={12} /> ERC-8183 spec
        </a>
      </div>
    </main>
  )
}
