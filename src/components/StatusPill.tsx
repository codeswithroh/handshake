import { jobStatusName } from '../contract'

const STATUS_STYLES: Record<string, { bg: string; color: string; dot: string }> = {
  Open:      { bg: 'rgba(113,113,122,0.2)', color: '#a1a1aa', dot: '#71717a' },
  Funded:    { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', dot: '#f59e0b' },
  Submitted: { bg: 'rgba(245,158,11,0.2)',  color: '#fbbf24', dot: '#fbbf24' },
  Completed: { bg: 'rgba(34,213,100,0.15)', color: '#22d564', dot: '#22d564' },
  Rejected:  { bg: 'rgba(244,63,94,0.15)',  color: '#f43f5e', dot: '#f43f5e' },
  Expired:   { bg: 'rgba(244,63,94,0.1)',   color: '#fb7185', dot: '#fb7185' },
}

export function StatusPill({ status }: { status: number }) {
  const name = jobStatusName(status)
  const s = STATUS_STYLES[name] ?? STATUS_STYLES.Open
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
      {name}
    </span>
  )
}
