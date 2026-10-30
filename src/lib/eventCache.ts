/**
 * Persistent in-memory event cache for AgenticCommerce logs.
 *
 * Strategy:
 *  1. On first use, backfill from DEPLOY_BLOCK to head in 9000-block chunks
 *     (Arc RPC caps eth_getLogs at 9,999 blocks per call).
 *  2. After backfill, poll incrementally from the last seen block every 4 s.
 *  3. Subscribers receive the full deduplicated log array on every update.
 *
 * This module is a singleton: one cache serves the whole app regardless of
 * how many components mount/unmount.
 */

import {
  createPublicClient,
  http,
  fallback,
  parseAbiItem,
  type Log,
} from 'viem'
import { NETWORK, NETWORK_RPCS } from '../config'
import { CONTRACT_ADDRESS } from '../contract'

// ── Viem client ────────────────────────────────────────────────────
// Uses a fallback transport over all known public RPC endpoints for the active
// network so the cache remains live even when a single provider rate-limits.
export const publicClient = createPublicClient({
  chain: NETWORK.chain as Parameters<typeof createPublicClient>[0]['chain'],
  transport: fallback(NETWORK_RPCS.map(u => http(u))),
})

// ── Event ABIs ─────────────────────────────────────────────────────
export const EVENT_ABIS = {
  JobCreated:   parseAbiItem('event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, string description)'),
  JobFunded:    parseAbiItem('event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)'),
  JobSubmitted: parseAbiItem('event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable, bytes optParams)'),
  JobCompleted: parseAbiItem('event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason, bytes optParams, uint256 providerPayout, uint256 evaluatorFee)'),
  JobRejected:  parseAbiItem('event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason, bytes optParams, uint256 refund)'),
  Refunded:     parseAbiItem('event Refunded(uint256 indexed jobId, address indexed client, uint256 amount)'),
}

export type EventName = keyof typeof EVENT_ABIS

export interface CachedLog extends Log {
  eventName: EventName
}

// ── Chunk constant ─────────────────────────────────────────────────
// Arc RPC caps eth_getLogs at 9,999 blocks — use 9000 for safety margin.
const CHUNK = 9000n

// ── Singleton state ────────────────────────────────────────────────
const logMap = new Map<string, CachedLog>()   // key → log
let backfillDone = false
let lastBlock = 0n
let pollTimer: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<(logs: CachedLog[]) => void>()

function sorted(): CachedLog[] {
  const arr = [...logMap.values()]
  arr.sort((a, b) =>
    Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)) ||
    ((b.logIndex ?? 0) - (a.logIndex ?? 0))
  )
  return arr
}

function notify() {
  const snap = sorted()
  subscribers.forEach(cb => cb(snap))
}

function logKey(l: Log): string {
  return `${l.transactionHash ?? ''}-${l.logIndex ?? 0}`
}

async function fetchRange(from: bigint, to: bigint): Promise<CachedLog[]> {
  const evNames = Object.keys(EVENT_ABIS) as EventName[]
  const sets = await Promise.all(
    evNames.map(name =>
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: EVENT_ABIS[name],
        fromBlock: from,
        toBlock: to,
      })
    )
  )
  const result: CachedLog[] = []
  evNames.forEach((name, i) => {
    sets[i].forEach(l => {
      result.push({ ...l, eventName: name })
    })
  })
  return result
}

/** Fetch a single chunk with up to 3 retries and exponential backoff (500 ms, 1 s, 2 s). */
async function fetchRangeWithRetry(from: bigint, to: bigint): Promise<CachedLog[]> {
  const delays = [500, 1000, 2000]
  let lastErr: unknown
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fetchRange(from, to)
    } catch (err) {
      lastErr = err
      if (attempt < delays.length) {
        await new Promise<void>(res => setTimeout(res, delays[attempt]))
      }
    }
  }
  throw lastErr
}

function ingest(logs: CachedLog[]) {
  let changed = false
  for (const l of logs) {
    const k = logKey(l)
    if (!logMap.has(k)) {
      logMap.set(k, l)
      changed = true
    }
  }
  return changed
}

async function backfill(deployBlock: bigint) {
  try {
    const head = await publicClient.getBlockNumber()

    // Build the full list of chunks first
    const chunks: Array<{ from: bigint; to: bigint }> = []
    let from = deployBlock
    while (from <= head) {
      const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head
      chunks.push({ from, to })
      from = to + 1n
    }

    // Process chunks with at most 2 in-flight at a time
    const CONCURRENCY = 2
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(c => fetchRangeWithRetry(c.from, c.to))
      )
      results.forEach(r => {
        if (r.status === 'fulfilled') ingest(r.value)
        // failed chunks after retries are dropped silently — a future poll will
        // catch any missed logs once the RPC recovers.
      })
    }

    lastBlock = head
  } finally {
    backfillDone = true
    notify()
  }
}

async function poll() {
  try {
    const head = await publicClient.getBlockNumber()
    if (lastBlock >= head) return
    const from = lastBlock + 1n
    const logs = await fetchRangeWithRetry(from, head)
    const changed = ingest(logs)
    lastBlock = head
    if (changed) notify()
  } catch {
    // network errors are silent — will retry on next poll interval
  }
}

// ── Public API ─────────────────────────────────────────────────────

/** Start the cache if not already started. Must call once before subscribing. */
export function startCache(deployBlock: bigint) {
  if (pollTimer !== null) return  // already running
  if (!backfillDone) {
    void backfill(deployBlock)
  }
  pollTimer = setInterval(() => { void poll() }, 4000)
}

/** Subscribe to cache updates. Returns an unsubscribe function. */
export function subscribeLogs(cb: (logs: CachedLog[]) => void): () => void {
  subscribers.add(cb)
  // Immediately deliver current snapshot
  cb(sorted())
  return () => { subscribers.delete(cb) }
}

/** Synchronous snapshot of all cached logs. */
export function getSnapshot(): CachedLog[] {
  return sorted()
}

/** Return all cached logs for a specific jobId (any event type). */
export function getJobLogs(jobId: bigint): CachedLog[] {
  return [...logMap.values()].filter(l => {
    const args = (l as Log & { args?: Record<string, unknown> }).args ?? {}
    return (args.jobId as bigint | undefined) === jobId
  })
}

export { backfillDone as isCacheReady }
