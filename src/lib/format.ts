/**
 * Formatting utilities — USDC amounts, addresses, hashes, time.
 */

const USDC_DECIMALS = 6

/** Format a raw bigint USDC amount to a human-readable string with 2–6 sig decimals */
export function formatUsdc(raw: bigint, opts?: { maxDecimals?: number; minDecimals?: number }): string {
  const min = opts?.minDecimals ?? 2
  const max = opts?.maxDecimals ?? 6
  const n = Number(raw) / 10 ** USDC_DECIMALS
  // Drop trailing zeros above the minimum
  const str = n.toFixed(max)
  const trimmed = str.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  const parts = trimmed.split('.')
  if ((parts[1]?.length ?? 0) < min) {
    return n.toFixed(min)
  }
  return trimmed
}

/** Parse a USDC string to raw bigint (6 decimals) */
export function parseUsdc(s: string): bigint {
  const n = parseFloat(s)
  if (isNaN(n)) return 0n
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS))
}

/** Truncate address to 0x1234…abcd */
export function fmtAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Truncate tx/bytes32 hash to 0x1234…abcd */
export function fmtHash(hash: string): string {
  if (!hash || hash.length < 10) return hash
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

/** Format seconds-since-epoch as a relative age ("2m ago", "1h ago") */
export function fmtAge(ts: number): string {
  const delta = Math.floor(Date.now() / 1000) - ts
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86400)}d ago`
}

/** Format a unix timestamp as a locale datetime string */
export function fmtTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Countdown from a unix timestamp */
export function fmtCountdown(expiredAt: number): string {
  const delta = expiredAt - Math.floor(Date.now() / 1000)
  if (delta <= 0) return 'expired'
  if (delta < 60) return `${delta}s`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ${delta % 60}s`
  return `${Math.floor(delta / 3600)}h ${Math.floor((delta % 3600) / 60)}m`
}
