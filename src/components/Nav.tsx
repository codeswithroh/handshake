import { NavLink, useNavigate } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { NETWORK } from '../config'

const links = [
  { to: '/', label: 'Live' },
  { to: '/hire', label: 'Hire' },
  { to: '/agents', label: 'Agents' },
  { to: '/break-it', label: 'Break It' },
  { to: '/judge', label: 'Judge' },
  { to: '/build', label: 'Build' },
]

export function Nav() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-50 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(16px)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <button
          onClick={() => { void navigate('/') }}
          className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
        >
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--green)', color: '#09090b' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2 6h3V2h2v4h3l-4 4-4-4z"/>
            </svg>
          </div>
          <span className="display font-semibold text-sm tracking-tight" style={{ color: 'var(--ink)' }}>Handshake</span>
          <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-strong)', color: 'var(--muted)', fontSize: '10px' }}>
            {NETWORK.label === 'Arc Testnet' ? 'TESTNET' : 'MAINNET'}
          </span>
        </button>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-[var(--green)] bg-[rgba(34,213,100,0.1)]'
                    : 'text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface)]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Wallet */}
        <ConnectKitButton.Custom>
          {({ isConnected, show, address }) => (
            <button
              onClick={show}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all"
              style={{
                background: isConnected ? 'var(--surface-strong)' : 'var(--green)',
                color: isConnected ? 'var(--ink)' : '#09090b',
                border: isConnected ? '1px solid var(--border)' : 'none',
              }}
            >
              {isConnected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full animate-live" style={{ background: 'var(--green)' }} />
                  <span className="mono text-xs">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
                </>
              ) : (
                'Connect'
              )}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>

      {/* Mobile nav */}
      <div className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-[var(--green)] bg-[rgba(34,213,100,0.1)]'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </header>
  )
}
