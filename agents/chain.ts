/**
 * Shared viem helpers for the agents/ scripts.
 *
 * - createPublicClient / createWalletClient from env
 * - Per-wallet nonce manager (fetch once, increment locally)
 * - sendTxWithRetry — gas params + up to 3 retries with back-off
 * - fetchJobRange — eth_getLogs in 9000-block chunks
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  defineChain,
  parseAbiItem,
  keccak256 as viemKeccak256,
  toBytes,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
  type TransactionReceipt,
  type AbiEvent,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { HANDSHAKE_ABI } from './abi.js'

// ── Chain definitions ──────────────────────────────────────────────

export const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
})

export const ARC_MAINNET = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

export function getChain() {
  return (process.env.NETWORK ?? 'testnet') === 'mainnet' ? ARC_MAINNET : ARC_TESTNET
}

export function getContractAddress(): Address {
  const addr = process.env.CONTRACT_ADDRESS
  if (!addr) throw new Error('CONTRACT_ADDRESS is required')
  return addr as Address
}

export function getUsdcAddress(): Address {
  return '0x3600000000000000000000000000000000000000'
}

export function getDeployBlock(): bigint {
  return BigInt(process.env.DEPLOY_BLOCK ?? '69223525')
}

// ── RPC transport ─────────────────────────────────────────────────
// RPC_URL may be a single URL or a comma-separated list.
// Multiple URLs are wrapped in viem's fallback() transport so the
// worker automatically retries on the next endpoint on failure.

function buildTransport() {
  const raw = process.env.RPC_URL ?? ''
  const urls = raw.split(',').map(u => u.trim()).filter(Boolean)
  if (urls.length === 0) {
    // Fall back to the chain default (set at chain definition time)
    return http()
  }
  if (urls.length === 1) return http(urls[0])
  return fallback(urls.map(u => http(u)))
}

// ── Public client (singleton) ──────────────────────────────────────

let _pub: PublicClient | null = null
export function publicClient(): PublicClient {
  if (!_pub) {
    _pub = createPublicClient({ chain: getChain(), transport: buildTransport() })
  }
  return _pub
}

// ── Wallet client factory ──────────────────────────────────────────

export function walletClient(privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({ account, chain: getChain(), transport: buildTransport() })
}

// ── Nonce manager ──────────────────────────────────────────────────

const nonces = new Map<Address, bigint>()

export async function nextNonce(address: Address): Promise<bigint> {
  if (!nonces.has(address)) {
    const n = await publicClient().getTransactionCount({ address, blockTag: 'pending' })
    nonces.set(address, BigInt(n))
  }
  const n = nonces.get(address)!
  nonces.set(address, n + 1n)
  return n
}

export function resetNonce(address: Address) {
  nonces.delete(address)
}

// ── Gas params ─────────────────────────────────────────────────────
// Arc mempool floor is 20 gwei on testnet. We set maxFeePerGas to 25 gwei
// and maxPriorityFeePerGas to 1 gwei so the tx can land regardless of base fee.

const MAX_FEE_PER_GAS       = 25_000_000_000n // 25 gwei
const MAX_PRIORITY_FEE      =  1_000_000_000n //  1 gwei

// ── sendTxWithRetry ────────────────────────────────────────────────

export interface TxOptions {
  wc: WalletClient
  address: Address
  abi: typeof HANDSHAKE_ABI | readonly unknown[]
  functionName: string
  args: readonly unknown[]
  label: string        // for logging
  account: Address     // sender
}

export async function sendTxWithRetry(opts: TxOptions): Promise<TransactionReceipt> {
  const pub = publicClient()
  const maxRetries = 3
  let lastErr: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = 3000 * 2 ** (attempt - 1)
      await sleep(delay)
      resetNonce(opts.account)  // re-fetch after failure
    }

    try {
      const nonce = await nextNonce(opts.account)

      const hash = await opts.wc.writeContract({
        address: opts.address,
        abi: opts.abi as Parameters<typeof opts.wc.writeContract>[0]['abi'],
        functionName: opts.functionName,
        args: opts.args as Parameters<typeof opts.wc.writeContract>[0]['args'],
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE,
        nonce: Number(nonce),
        account: opts.wc.account!,
        chain: undefined,
      })

      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 })
      if (receipt.status === 'reverted') {
        throw new Error(`tx reverted: ${hash}`)
      }
      return receipt
    } catch (e) {
      lastErr = e
      console.error(`[${opts.label}] attempt ${attempt + 1} failed: ${(e as Error).message?.slice(0, 120)}`)
    }
  }

  throw new Error(`[${opts.label}] all retries exhausted: ${(lastErr as Error)?.message?.slice(0, 120)}`)
}

// ── keccak256 helper (bytes) ───────────────────────────────────────

export function keccak256OfText(text: string): Hex {
  return viemKeccak256(toBytes(text))
}

export function textToBytes(text: string): Hex {
  // Encode as raw UTF-8 bytes, returned as 0x-prefixed hex
  const enc = new TextEncoder().encode(text)
  return ('0x' + Buffer.from(enc).toString('hex')) as Hex
}

// ── Event ABIs ─────────────────────────────────────────────────────

export const JOB_FUNDED_ABI    = parseAbiItem('event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)') as AbiEvent
export const JOB_SUBMITTED_ABI = parseAbiItem('event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable, bytes optParams)') as AbiEvent
export const JOB_CREATED_ABI   = parseAbiItem('event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, string description)') as AbiEvent

// ── fetchJobLogs — chunked eth_getLogs ────────────────────────────

const CHUNK = 9000n

export async function fetchLogsRange<T>(
  event: AbiEvent,
  from: bigint,
  to: bigint,
  address: Address,
): Promise<T[]> {
  const pub = publicClient()
  const all: T[] = []
  let cur = from
  while (cur <= to) {
    const end = cur + CHUNK - 1n < to ? cur + CHUNK - 1n : to
    const logs = await pub.getLogs({ address, event, fromBlock: cur, toBlock: end })
    all.push(...(logs as T[]))
    cur = end + 1n
  }
  return all
}

// ── Utilities ──────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function formatUsdc(raw: bigint): string {
  return (Number(raw) / 1e6).toFixed(6).replace(/\.?0+$/, '')
}

export function fmtAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function fmtTx(h: string): string {
  return `${h.slice(0, 10)}…`
}
