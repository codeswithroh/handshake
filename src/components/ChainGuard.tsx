import { useAccount, useSwitchChain } from 'wagmi'
import { TARGET_CHAIN_ID, NETWORK } from '../config'

interface Props { children: React.ReactNode }

export function ChainGuard({ children }: Props) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === TARGET_CHAIN_ID) return <>{children}</>

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="rounded-2xl p-8 max-w-sm w-full text-center" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h2 className="display font-semibold text-lg mb-1" style={{ color: 'var(--ink)' }}>Wrong Network</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-2)' }}>
          Switch your wallet to <strong style={{ color: 'var(--ink)' }}>{NETWORK.label}</strong> to continue.
        </p>
        <button
          onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
          disabled={isPending}
          className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-60"
          style={{ background: 'var(--amber)', color: '#09090b' }}
        >
          {isPending ? 'Switching…' : `Switch to ${NETWORK.label}`}
        </button>
      </div>
    </div>
  )
}
