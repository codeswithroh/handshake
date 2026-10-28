/**
 * Exports Handshake logo PNGs using @resvg/resvg-wasm.
 * Run: bun scripts/export-logo-png.ts
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Load the WASM binary directly from node_modules
const wasmPath = resolve(import.meta.dir, '../node_modules/@resvg/resvg-wasm/index_bg.wasm')
const wasmBuf = readFileSync(wasmPath)
await initWasm(wasmBuf)

const ACCENT  = '#22d564'
const DARK_BG = '#0d0d10'

// ── SVG builders ──────────────────────────────────────────────────

function iconSvg(bg: string, accent: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="9" fill="${bg}"/>
  <polygon points="10,12 16.9,16 16.9,24 10,28 3.1,24 3.1,16"
    fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="10" cy="20" r="2.5" fill="${accent}"/>
  <polygon points="30,12 36.9,16 36.9,24 30,28 23.1,24 23.1,16"
    fill="${accent}" fill-opacity="0.08" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.4" stroke-linejoin="round"/>
  <circle cx="30" cy="20" r="2.5" fill="${accent}" fill-opacity="0.5"/>
  <path d="M12.5 20 H18 V15 H22 V25 H26 V20 H27.5"
    stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.75"/>
  <circle cx="20" cy="20" r="3.5" fill="${accent}" fill-opacity="0.2"/>
  <circle cx="20" cy="20" r="2" fill="${accent}"/>
  <path d="M19.1 18.8 v1.8 q0 0.9 0.9 0.9 q0.9 0 0.9 -0.9 v-1.8"
    stroke="white" stroke-width="0.9" stroke-linecap="round" fill="none"/>
</svg>`
}

function wordmarkSvg(bg: string, textColor: string, accent: string): string {
  const hasBg = bg !== 'transparent'
  return `<svg width="1280" height="400" viewBox="0 0 1280 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${hasBg ? `<rect width="1280" height="400" fill="${bg}"/>` : ''}
  <!-- Icon scaled 10× (40-unit → 400px) -->
  <g transform="scale(10)">
    <polygon points="10,12 16.9,16 16.9,24 10,28 3.1,24 3.1,16"
      fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="10" cy="20" r="2.5" fill="${accent}"/>
    <polygon points="30,12 36.9,16 36.9,24 30,28 23.1,24 23.1,16"
      fill="${accent}" fill-opacity="0.08" stroke="${accent}" stroke-opacity="0.5" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="30" cy="20" r="2.5" fill="${accent}" fill-opacity="0.5"/>
    <path d="M12.5 20 H18 V15 H22 V25 H26 V20 H27.5"
      stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.75"/>
    <circle cx="20" cy="20" r="3.5" fill="${accent}" fill-opacity="0.2"/>
    <circle cx="20" cy="20" r="2" fill="${accent}"/>
    <path d="M19.1 18.8 v1.8 q0 0.9 0.9 0.9 q0.9 0 0.9 -0.9 v-1.8"
      stroke="white" stroke-width="0.9" stroke-linecap="round" fill="none"/>
  </g>
  <!-- Wordmark text (resvg uses system fonts) -->
  <text x="440" y="286"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-weight="900"
    font-size="200"
    letter-spacing="-6"
    fill="${textColor}">Handshake</text>
</svg>`
}

// ── Write PNGs ────────────────────────────────────────────────────

const dist = resolve(import.meta.dir, '../public')
mkdirSync(dist, { recursive: true })

function render(svg: string, out: string) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: true } })
  const data = resvg.render()
  writeFileSync(out, data.asPng())
  console.log(`  ${out.replace(resolve(import.meta.dir, '..'), '')}  (${data.width}×${data.height})`)
}

console.log('\nHandshake logo exports:')

// Icon variants — 512×512
render(iconSvg(DARK_BG,   ACCENT, 512), `${dist}/handshake-icon-dark-512.png`)
render(iconSvg('#ffffff', ACCENT, 512), `${dist}/handshake-icon-white-512.png`)

// Wordmark variants — 1280×400 (@2×)
render(wordmarkSvg(DARK_BG,   '#f1f1f3', ACCENT), `${dist}/handshake-wordmark-dark.png`)
render(wordmarkSvg('#ffffff',  '#0d0d10', ACCENT), `${dist}/handshake-wordmark-light.png`)
render(wordmarkSvg('transparent', '#0d0d10', ACCENT), `${dist}/handshake-wordmark-transparent-dark-text.png`)
render(wordmarkSvg('transparent', '#ffffff', ACCENT), `${dist}/handshake-wordmark-transparent-white-text.png`)

console.log('\nDone. Open the Code panel, navigate to public/, and download the files.')
