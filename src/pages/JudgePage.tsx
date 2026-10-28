/**
 * /judge — "60-second review path"
 * A guided four-step tour for a reviewer:
 *  1. Hire Bard for $0.02 (real transaction)
 *  2. Hire Lazy for $0.01 — watch the refund path
 *  3. Try to cheat it (links to /break-it)
 *  4. Links to contract, repo, test results, AUDIT.md
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CONTRACT_ADDRESS } from '../contract'
import { NETWORK } from '../config'
import { ExternalLink, ChevronRight, Timer } from 'lucide-react'

// ── Countdown ─────────────────────────────────────────────────────

function useTimer() {
  const [elapsed, setElapsed] = useState(0)
  // Store start time in a ref; initialised inside the effect so Date.now()
  // runs only once per mount (not during render), satisfying the purity lint rule.
  const startRef = useRef(0)
  useEffect(() => {
    startRef.current = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, 60 - elapsed)
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  return { elapsed, remaining, display: `${mm}:${ss}` }
}

// ── Step component ────────────────────────────────────────────────

function Step({
  number, title, tagline, done, active, children,
}: {
  number: number; title: string; tagline: string; done: boolean; active: boolean; children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        border: `1px solid ${done ? 'rgba(34,213,100,0.3)' : active ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
        background: done ? 'rgba(34,213,100,0.04)' : active ? 'rgba(245,158,11,0.03)' : 'var(--surface)',
      }}
    >
      <div className="px-5 py-4 flex items-center gap-4">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 display font-bold text-sm"
          style={{
            background: done ? 'var(--green)' : active ? 'rgba(245,158,11,0.2)' : 'var(--surface-strong)',
            color: done ? '#09090b' : active ? 'var(--amber)' : 'var(--muted)',
          }}
        >
          {done ? '✓' : number}
        </div>
        <div>
          <div className="font-semibold text-sm" style={{ color: done ? 'var(--green)' : active ? 'var(--ink)' : 'var(--ink-2)' }}>{title}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{tagline}</div>
        </div>
      </div>
      {active && (
        <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
          {children}
        </div>
      )}
      {done && (
        <div className="px-5 pb-4 pt-1 border-t" style={{ borderColor: 'rgba(34,213,100,0.15)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── External link button ──────────────────────────────────────────

function LinkCard({ href, label, sub, color = 'var(--ink-2)' }: { href: string; label: string; sub?: string; color?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-4 py-3 hover:opacity-80 transition-opacity"
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', textDecoration: 'none' }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color }}>{label}</div>
        {sub && <div className="mono text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{sub}</div>}
      </div>
      <ExternalLink size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
    </a>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export function JudgePage() {
  const navigate = useNavigate()
  const { elapsed, remaining, display } = useTimer()
  const [step, setStep] = useState(1)

  // Auto-advance timer display colour
  const timerColor = remaining > 20 ? 'var(--green)' : remaining > 10 ? 'var(--amber)' : 'var(--red)'

  // Step 1: hire Bard
  // Step 2: hire Lazy
  // Step 3: break-it
  // Step 4: links

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h1 className="display font-bold text-3xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>60-second review</h1>
          <div className="flex items-center gap-2 mono font-bold text-xl" style={{ color: timerColor }}>
            <Timer size={16} />
            {elapsed < 60 ? display : <span style={{ color: 'var(--muted)', fontSize: '14px' }}>done</span>}
          </div>
        </div>
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          Four steps that cover the whole escrow lifecycle. Each step links to a live transaction.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Step 1: Hire Bard */}
        <Step
          number={1}
          title="Hire Bard for $0.02"
          tagline="One transaction creates + funds the escrow."
          done={step > 1}
          active={step === 1}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
            Connect a wallet and hire Bard on <span className="mono" style={{ color: 'var(--amber)' }}>{NETWORK.label}</span>.
            Sentinel holds the USDC until the job is approved. Pre-filled with a haiku prompt.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { void navigate('/hire?agent=bard&task=Write+a+haiku+about+trustless+escrow') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: 'var(--green)', color: '#09090b' }}
            >
              Hire Bard ($0.02) <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2.5 rounded-xl text-sm transition-all hover:opacity-80"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              Skip (already done)
            </button>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            After the transaction confirms, come back and click "Skip" or "Next" to proceed.
          </p>
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="mt-3 flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
              style={{ color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Next step <ChevronRight size={12} />
            </button>
          )}
        </Step>

        {/* Step 2: Hire Lazy */}
        <Step
          number={2}
          title="Hire Lazy for $0.01 — watch the refund"
          tagline="Bad output triggers reject → full USDC returned."
          done={step > 2}
          active={step === 2}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
            Lazy is the chaos-monkey agent. It deliberately produces bad output.
            Sentinel will reject the deliverable and the full $0.01 returns to your wallet.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { void navigate('/hire?agent=lazy') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: 'rgba(244,63,94,0.2)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.3)' }}
            >
              Hire Lazy ($0.01) <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2.5 rounded-xl text-sm transition-all hover:opacity-80"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              Skip
            </button>
          </div>
          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              className="mt-3 flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
              style={{ color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Next step <ChevronRight size={12} />
            </button>
          )}
        </Step>

        {/* Step 3: Break it */}
        <Step
          number={3}
          title="Try to cheat it"
          tagline="8 attack simulations — all refused, nothing signed."
          done={step > 3}
          active={step === 3}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
            Eight <span className="mono" style={{ color: 'var(--muted)' }}>eth_call</span> simulations covering
            the standard attack surface: non-evaluator complete, provider self-reject,
            hash mismatch, early refund, double-complete, and more.
            Each is caught with a named custom error before it reaches the mempool.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { void navigate('/break-it') }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            >
              Open /break-it <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setStep(4)}
              className="px-4 py-2.5 rounded-xl text-sm transition-all hover:opacity-80"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              Skip
            </button>
          </div>
          {step === 3 && (
            <button
              onClick={() => setStep(4)}
              className="mt-3 flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
              style={{ color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Next step <ChevronRight size={12} />
            </button>
          )}
        </Step>

        {/* Step 4: Links */}
        <Step
          number={4}
          title="Read the receipts"
          tagline="Contract, tests, and the full security audit — all public."
          done={false}
          active={step >= 4}
        >
          <div className="flex flex-col gap-2 mt-1">
            <LinkCard
              href={`${NETWORK.explorerBase}/address/${CONTRACT_ADDRESS}`}
              label="Contract on Arc Explorer"
              sub={CONTRACT_ADDRESS}
              color="var(--green)"
            />
            <LinkCard
              href="https://github.com"
              label="Source code on GitHub"
              sub="contracts/AgenticCommerce.sol  •  84 tests"
            />
            <LinkCard
              href="/docs/AUDIT.md"
              label="Security audit report"
              sub="10 findings fixed  •  max severity preset"
              color="var(--amber)"
            />
            <LinkCard
              href={`${NETWORK.explorerBase}/address/${CONTRACT_ADDRESS}#transactions`}
              label="All transactions"
              sub="Live from the Arc Testnet explorer"
            />
          </div>
          <div className="mt-4 rounded-xl px-4 py-3" style={{ background: 'rgba(34,213,100,0.06)', border: '1px solid rgba(34,213,100,0.2)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--green)' }}>Review complete in {elapsed}s</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
              ERC-8183 escrow • USDC-native on Arc • 84 passing tests • 10-finding audit fixed
            </p>
          </div>
        </Step>
      </div>
    </main>
  )
}
