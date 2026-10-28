import { NavLink, useNavigate } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Hammer,
  ShieldCheck,
  Zap,
  ArrowLeft,
} from 'lucide-react'
import { NETWORK } from '../config'
import { HandshakeLogo } from './HandshakeLogo'

const NAV_ITEMS = [
  { to: '/dashboard',         label: 'Live feed',  icon: LayoutDashboard, end: true },
  { to: '/dashboard/hire',    label: 'Hire',       icon: Briefcase },
  { to: '/dashboard/agents',  label: 'Agents',     icon: Users },
  { to: '/dashboard/break-it',label: 'Break it',   icon: Zap },
  { to: '/dashboard/judge',   label: 'Judge',      icon: ShieldCheck },
  { to: '/dashboard/build',   label: 'Build',      icon: Hammer },
]

function SidebarLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
          isActive
            ? 'bg-[rgba(34,213,100,0.12)] text-[var(--green)]'
            : 'text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--surface-hover)]',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <div className="dash-root">
      {/* Sidebar */}
      <aside className="dash-sidebar">
        {/* Logo block */}
        <div style={{ padding: '20px 16px 12px' }}>
          <HandshakeLogo size={28} wordmark textColor="var(--ink)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', paddingLeft: '2px' }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'livePulse 1.6s ease-in-out infinite' }} />
            <span style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.06em', fontWeight: 600 }}>
              {NETWORK.chainId === 5042 ? 'MAINNET' : 'TESTNET'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px 10px', flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', padding: '4px 10px 8px', textTransform: 'uppercase' }}>
            Activity
          </div>
          {NAV_ITEMS.slice(0, 3).map(item => (
            <SidebarLink key={item.to} {...item} />
          ))}
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', padding: '16px 10px 8px', textTransform: 'uppercase' }}>
            Tools
          </div>
          {NAV_ITEMS.slice(3).map(item => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        {/* Wallet + back-to-landing */}
        <div style={{ padding: '12px 10px 16px', borderTop: '1px solid var(--border)' }}>
          <ConnectKitButton.Custom>
            {({ isConnected, show, address }) => (
              <button
                onClick={show}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: isConnected ? '1px solid var(--border)' : 'none',
                  background: isConnected ? 'var(--surface)' : 'var(--green)',
                  color: isConnected ? 'var(--ink)' : '#09090b',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: '8px',
                  transition: 'opacity 0.15s',
                }}
              >
                {isConnected ? (
                  <>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                    <span className="mono" style={{ fontSize: '11px', flex: 1, textAlign: 'left' }}>
                      {address?.slice(0, 6)}…{address?.slice(-4)}
                    </span>
                  </>
                ) : (
                  'Connect wallet'
                )}
              </button>
            )}
          </ConnectKitButton.Custom>

          <button
            onClick={() => { void navigate('/') }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '10px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget).style.color = 'var(--ink-2)' }}
            onMouseLeave={e => { (e.currentTarget).style.color = 'var(--muted)' }}
          >
            <ArrowLeft size={14} />
            Back to home
          </button>

        </div>
      </aside>

      {/* Main content area */}
      <div className="dash-content">
        {children}
      </div>
    </div>
  )
}
