/**
 * HandshakeLogo — the Handshake brand mark.
 *
 * Concept: two hexagonal nodes (representing autonomous agents) connected by
 * a circuit-line that flows into a single USDC-green settlement dot at the
 * centre. The name "Handshake" sits to the right when wordmark=true.
 *
 * The mark reads well at 20px–120px and on both light and dark backgrounds.
 */

interface Props {
  /** Total height of the SVG mark in px. Width scales proportionally. */
  size?: number
  /** When true renders the wordmark "Handshake" beside the icon. */
  wordmark?: boolean
  /** Override the settlement-dot / primary accent colour. */
  accentColor?: string
  /** Text colour for the wordmark. */
  textColor?: string
}

export function HandshakeLogo({
  size = 32,
  wordmark = true,
  accentColor = '#22d564',
  textColor = 'currentColor',
}: Props) {
  // The icon itself is drawn in a 40×40 viewport.
  const iconH = size
  const iconW = size

  const icon = (
    <svg
      width={iconW}
      height={iconH}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* ── Left node hex ── */}
      {/* Hexagon: flat-top orientation, centred at (10, 20), radius 8 */}
      <polygon
        points="10,12 16.9,16 16.9,24 10,28 3.1,24 3.1,16"
        fill={accentColor}
        fillOpacity="0.15"
        stroke={accentColor}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Node dot left */}
      <circle cx="10" cy="20" r="2.5" fill={accentColor}/>

      {/* ── Right node hex ── */}
      {/* Hexagon centred at (30, 20) */}
      <polygon
        points="30,12 36.9,16 36.9,24 30,28 23.1,24 23.1,16"
        fill={accentColor}
        fillOpacity="0.08"
        stroke={accentColor}
        strokeOpacity="0.5"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Node dot right */}
      <circle cx="30" cy="20" r="2.5" fill={accentColor} fillOpacity="0.5"/>

      {/* ── Connecting circuit path ── */}
      {/* Stepped line: left node → mid-point elbow → right node */}
      <path
        d="M12.5 20 H18 V15 H22 V25 H26 V20 H27.5"
        stroke={accentColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />

      {/* ── Settlement glow at centre ── */}
      <circle cx="20" cy="20" r="3.5" fill={accentColor} fillOpacity="0.18"/>
      <circle cx="20" cy="20" r="2" fill={accentColor}/>

      {/* ── USDC "U" micro-glyph inside the centre dot ── */}
      <path
        d="M19.1 18.8 v1.8 q0 0.9 0.9 0.9 q0.9 0 0.9 -0.9 v-1.8"
        stroke="white"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )

  if (!wordmark) return icon

  const fontSize = Math.round(size * 0.47)
  const letterSpacing = -0.03 * fontSize

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.28),
        userSelect: 'none',
      }}
    >
      {icon}
      <span
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize,
          letterSpacing,
          color: textColor,
          lineHeight: 1,
        }}
      >
        Handshake
      </span>
    </span>
  )
}
