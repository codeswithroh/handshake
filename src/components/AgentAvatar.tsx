/**
 * AgentAvatar — unique SVG personality portrait for each agent.
 * Each avatar is a 1:1 square at the requested size.
 * No external images or emoji — pure SVG geometry.
 */

interface Props {
  agentId: string   // 'scribe' | 'polyglot' | 'bard' | 'lazy' | 'sentinel'
  size?: number
  className?: string
}

// ── Scribe: calm scholar — quill pen, circular glasses, ink-blue palette ──────
function ScribeAvatar({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="48" height="48" rx="14" fill="#1a2744"/>
      {/* Face */}
      <ellipse cx="24" cy="26" rx="13" ry="14" fill="#f5deb3"/>
      {/* Hair */}
      <path d="M11 24 Q11 10 24 10 Q37 10 37 24 L35 22 Q33 12 24 12 Q15 12 13 22Z" fill="#3d2b1f"/>
      {/* Glasses — left lens */}
      <circle cx="19" cy="24" r="4" stroke="#3d2b1f" strokeWidth="1.4" fill="rgba(100,160,255,0.15)"/>
      {/* Glasses — right lens */}
      <circle cx="29" cy="24" r="4" stroke="#3d2b1f" strokeWidth="1.4" fill="rgba(100,160,255,0.15)"/>
      {/* Glasses bridge */}
      <line x1="23" y1="24" x2="25" y2="24" stroke="#3d2b1f" strokeWidth="1.2"/>
      {/* Eyes */}
      <circle cx="19" cy="24" r="1.4" fill="#2d1f0e"/>
      <circle cx="29" cy="24" r="1.4" fill="#2d1f0e"/>
      {/* Eye gleam */}
      <circle cx="19.7" cy="23.3" r="0.5" fill="white"/>
      <circle cx="29.7" cy="23.3" r="0.5" fill="white"/>
      {/* Nose */}
      <path d="M24 26 Q22.5 29 24 30 Q25.5 29 24 26Z" fill="#d4a97a" fillOpacity="0.7"/>
      {/* Mouth — slight smile */}
      <path d="M20.5 33 Q24 35.5 27.5 33" stroke="#9b6b4a" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      {/* Quill badge at bottom-right */}
      <rect x="30" y="33" width="14" height="12" rx="4" fill="#2563eb"/>
      <path d="M37 39 L34 36 C34 36 36 34 38 36 L37 39Z" fill="white" fillOpacity="0.9"/>
      <line x1="37" y1="39" x2="35.5" y2="42" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

// ── Polyglot: multilingual globe-trotter — warm terracotta, speech bubble ─────
function PolyglotAvatar({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="48" height="48" rx="14" fill="#7c2d12"/>
      {/* Hair — flowing */}
      <path d="M11 25 Q10 10 24 9 Q38 10 37 25 L36 20 Q33 11 24 11 Q15 11 12 20Z" fill="#1c0a00"/>
      {/* Face */}
      <ellipse cx="24" cy="27" rx="13" ry="13.5" fill="#f5c6a0"/>
      {/* Hair sides */}
      <path d="M11 25 Q11 33 15 37 L15 27Z" fill="#1c0a00"/>
      <path d="M37 25 Q37 33 33 37 L33 27Z" fill="#1c0a00"/>
      {/* Eyes — expressive, slightly wide */}
      <ellipse cx="19.5" cy="26" rx="2.5" ry="2.8" fill="white"/>
      <ellipse cx="28.5" cy="26" rx="2.5" ry="2.8" fill="white"/>
      <circle cx="19.5" cy="26.5" r="1.7" fill="#5c3d00"/>
      <circle cx="28.5" cy="26.5" r="1.7" fill="#5c3d00"/>
      <circle cx="20.2" cy="25.7" r="0.5" fill="white"/>
      <circle cx="29.2" cy="25.7" r="0.5" fill="white"/>
      {/* Eyebrows — raised, curious */}
      <path d="M17 22.5 Q19.5 21 22 22.5" stroke="#3d1a00" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <path d="M26 22.5 Q28.5 21 31 22.5" stroke="#3d1a00" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      {/* Nose */}
      <path d="M24 28 Q22.5 31 24 32 Q25.5 31 24 28Z" fill="#d4956b" fillOpacity="0.8"/>
      {/* Smile — warm open */}
      <path d="M20 34.5 Q24 38 28 34.5" stroke="#9b4a20" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      {/* Tiny speech-bubble badge */}
      <rect x="31" y="3" width="14" height="11" rx="3.5" fill="#f97316"/>
      <path d="M35 9.5 h5M35 7.5 h3" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M33 13 L35 11" stroke="#f97316" strokeWidth="1.5"/>
    </svg>
  )
}

// ── Bard: dreamy poet — deep violet, creative spark, soft expression ──────────
function BardAvatar({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="48" height="48" rx="14" fill="#2e1065"/>
      {/* Stars scattered */}
      <circle cx="8" cy="8" r="1" fill="#c4b5fd" fillOpacity="0.6"/>
      <circle cx="40" cy="12" r="1.2" fill="#c4b5fd" fillOpacity="0.5"/>
      <circle cx="42" cy="38" r="0.8" fill="#c4b5fd" fillOpacity="0.4"/>
      <circle cx="6" cy="36" r="1" fill="#c4b5fd" fillOpacity="0.5"/>
      {/* Hair — wavy, swept */}
      <path d="M11 26 Q9 10 24 8 Q39 8 38 24 L36 20 C34 10 14 10 12 20Z" fill="#4c1d95"/>
      {/* Hair curl left */}
      <path d="M11 26 Q9 32 12 38 L13 30Z" fill="#4c1d95"/>
      {/* Face */}
      <ellipse cx="24" cy="28" rx="13" ry="13" fill="#fde8d8"/>
      {/* Eyes — half-lidded, dreamy */}
      <ellipse cx="19.5" cy="27" rx="2.8" ry="2.2" fill="white"/>
      <ellipse cx="28.5" cy="27" rx="2.8" ry="2.2" fill="white"/>
      <ellipse cx="19.5" cy="27.5" rx="1.8" ry="1.5" fill="#6d28d9"/>
      <ellipse cx="28.5" cy="27.5" rx="1.8" ry="1.5" fill="#6d28d9"/>
      <circle cx="20.1" cy="26.8" r="0.45" fill="white"/>
      <circle cx="29.1" cy="26.8" r="0.45" fill="white"/>
      {/* Droopy eyelids */}
      <path d="M16.7 25.5 Q19.5 24 22.3 25.5" stroke="#d4a0c0" strokeWidth="0.9" fill="none"/>
      <path d="M25.7 25.5 Q28.5 24 31.3 25.5" stroke="#d4a0c0" strokeWidth="0.9" fill="none"/>
      {/* Nose */}
      <path d="M24 29.5 Q22.8 32 24 33 Q25.2 32 24 29.5Z" fill="#d4856b" fillOpacity="0.6"/>
      {/* Gentle smile */}
      <path d="M21 35.5 Q24 37.5 27 35.5" stroke="#a87060" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      {/* Note badge */}
      <rect x="30" y="3" width="14" height="12" rx="3.5" fill="#7c3aed"/>
      <path d="M38 6 L38 13 M36 7 L36 14" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="35" cy="14" r="1.4" fill="white"/>
      <circle cx="37" cy="13" r="1.4" fill="white"/>
    </svg>
  )
}

// ── Lazy: deliberately bored chaos monkey — washed-out, sleepy, slouched ──────
function LazyAvatar({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background — faded red */}
      <rect width="48" height="48" rx="14" fill="#3b0a0a"/>
      {/* Messy hair */}
      <path d="M12 26 Q10 10 24 10 Q38 10 36 26 L34 20 Q30 9 24 11 Q18 9 14 20Z" fill="#2d1010"/>
      <path d="M12 26 Q10 18 10 28L12 26Z" fill="#2d1010"/>
      <path d="M36 26 Q38 18 38 28L36 26Z" fill="#2d1010"/>
      {/* Random messy tufts */}
      <path d="M17 11 Q16 7 19 10" stroke="#2d1010" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 10 Q23 6 26 9" stroke="#2d1010" strokeWidth="2" strokeLinecap="round"/>
      {/* Face */}
      <ellipse cx="24" cy="27" rx="13" ry="13" fill="#fdc5b5"/>
      {/* Closed sleepy eyes — just lines */}
      <path d="M17 26 Q19.5 24.5 22 26" stroke="#7f1d1d" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M26 26 Q28.5 24.5 31 26" stroke="#7f1d1d" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* Bags under eyes */}
      <path d="M17.5 27.5 Q19.5 28.5 21.5 27.5" stroke="#e09090" strokeWidth="0.8" fill="none"/>
      <path d="M26.5 27.5 Q28.5 28.5 30.5 27.5" stroke="#e09090" strokeWidth="0.8" fill="none"/>
      {/* Nose */}
      <path d="M24 29 Q23 31.5 24 32 Q25 31.5 24 29Z" fill="#c08070" fillOpacity="0.7"/>
      {/* Flat unimpressed mouth */}
      <line x1="20.5" y1="35" x2="27.5" y2="35" stroke="#a05040" strokeWidth="1.3" strokeLinecap="round"/>
      {/* Zzz badge */}
      <rect x="30" y="3" width="14" height="12" rx="3.5" fill="#9f1239"/>
      <text x="34" y="12" fontSize="8" fill="white" fontFamily="sans-serif" fontWeight="700">Zzz</text>
    </svg>
  )
}

// ── Sentinel: authoritative evaluator — cool grey, sharp look, shield badge ───
function SentinelAvatar({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="48" height="48" rx="14" fill="#0f172a"/>
      {/* Geometric circuit lines — data aesthetic */}
      <path d="M4 10 h6 v4 h4" stroke="#334155" strokeWidth="0.8"/>
      <path d="M44 38 h-6 v-4 h-4" stroke="#334155" strokeWidth="0.8"/>
      <circle cx="10" cy="10" r="1.2" fill="#475569"/>
      <circle cx="38" cy="38" r="1.2" fill="#475569"/>
      {/* Hair — short, neat */}
      <path d="M12 27 Q11 12 24 11 Q37 12 36 27 L34 22 Q32 13 24 13 Q16 13 14 22Z" fill="#1e293b"/>
      {/* Face */}
      <ellipse cx="24" cy="28" rx="12.5" ry="13" fill="#e2d9c8"/>
      {/* Eyes — sharp, alert */}
      <ellipse cx="19.5" cy="27" rx="2.8" ry="2.5" fill="white"/>
      <ellipse cx="28.5" cy="27" rx="2.8" ry="2.5" fill="white"/>
      <circle cx="19.5" cy="27" r="1.8" fill="#1e3a5f"/>
      <circle cx="28.5" cy="27" r="1.8" fill="#1e3a5f"/>
      <circle cx="20.1" cy="26.3" r="0.5" fill="white"/>
      <circle cx="29.1" cy="26.3" r="0.5" fill="white"/>
      {/* Sharp straight eyebrows */}
      <line x1="17" y1="23.5" x2="22" y2="23" stroke="#334155" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="26" y1="23" x2="31" y2="23.5" stroke="#334155" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Nose — straight */}
      <path d="M24 29 Q23 32 24 33 Q25 32 24 29Z" fill="#c0a87a" fillOpacity="0.8"/>
      {/* Neutral judging mouth */}
      <path d="M20.5 35 Q24 36 27.5 35" stroke="#7a6040" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      {/* Shield badge */}
      <path d="M35 3 L41 5.5 L41 12 Q41 15.5 38 17 Q35 15.5 35 12Z" fill="#0ea5e9"/>
      <path d="M37 9.5 L37.5 12 L39.5 8" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

export function AgentAvatar({ agentId, size = 48, className }: Props) {
  const s = size
  switch (agentId) {
    case 'scribe':   return <ScribeAvatar s={s} />
    case 'polyglot': return <PolyglotAvatar s={s} />
    case 'bard':     return <BardAvatar s={s} />
    case 'lazy':     return <LazyAvatar s={s} />
    case 'sentinel': return <SentinelAvatar s={s} />
    default: {
      // Fallback — initial letter
      const letter = agentId.charAt(0).toUpperCase()
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className={className}>
          <rect width="48" height="48" rx="14" fill="#1e1e2a"/>
          <text x="24" y="32" textAnchor="middle" fontSize="20" fill="#f1f1f3" fontFamily="Space Grotesk, sans-serif" fontWeight="700">{letter}</text>
        </svg>
      )
    }
  }
}
