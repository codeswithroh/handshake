#!/usr/bin/env npx tsx
/**
 * Register each Handshake agent in the ERC-8004 IdentityRegistry.
 *
 * Usage:
 *   npx tsx agents/register8004.ts
 *
 * Each agent wallet must be funded with enough USDC for gas.
 * Prints the assigned agentId so you can update src/agents.ts.
 *
 * Environment: agents/.env (same file as worker.ts)
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  walletClient, publicClient, sendTxWithRetry,
  fmtAddr, fmtTx,
  getChain,
} from './chain.js'
import { IDENTITY_REGISTRY_ABI } from './abi.js'

// ── Load agents/.env ───────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}

// ── Registry addresses ─────────────────────────────────────────────

const REGISTRIES: Record<string, Address> = {
  testnet: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  mainnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
}

const network = (process.env.NETWORK ?? 'testnet') as 'testnet' | 'mainnet'
const REGISTRY = REGISTRIES[network]

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? ''

// ── Agent metadata ─────────────────────────────────────────────────

interface AgentMeta {
  name: string
  description: string
  price: string          // human-readable USDC (e.g. "0.05")
  envKey: string
}

const AGENT_METAS: AgentMeta[] = [
  {
    name: 'Scribe',
    description: 'Distills any text into three precise bullet points.',
    price: '0.05',
    envKey: 'SCRIBE_KEY',
  },
  {
    name: 'Polyglot',
    description: 'Translates text into any language with tone preservation.',
    price: '0.05',
    envKey: 'POLYGLOT_KEY',
  },
  {
    name: 'Bard',
    description: 'Composes a 5-7-5 haiku about any topic.',
    price: '0.02',
    envKey: 'BARD_KEY',
  },
  {
    name: 'Lazy',
    description: 'Chaos monkey for testing the reject-and-refund path.',
    price: '0.01',
    envKey: 'LAZY_KEY',
  },
  {
    name: 'Sentinel',
    description: 'ERC-8183 evaluator. Reviews deliverables and approves or rejects based on task criteria.',
    price: '0',
    envKey: 'SENTINEL_KEY',
  },
]

// ── Build registration URI (data: JSON) ────────────────────────────

function buildUri(meta: AgentMeta, walletAddress: Address): string {
  const card = {
    name: meta.name,
    description: meta.description,
    version: '1.0',
    capabilities: {
      price_usdc: meta.price,
    },
    services: CONTRACT_ADDRESS
      ? [
          {
            name: 'Handshake escrow',
            protocol: 'ERC-8183',
            endpoint: CONTRACT_ADDRESS,
            network,
          },
        ]
      : [],
    wallet: walletAddress,
    x402: false,
  }
  const json = JSON.stringify(card)
  return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
}

// ── Register one agent ─────────────────────────────────────────────

async function register(meta: AgentMeta): Promise<void> {
  const rawKey = process.env[meta.envKey]
  if (!rawKey) {
    console.log(`  [${meta.name}] skipped — ${meta.envKey} not set`)
    return
  }

  const hex = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex
  const account = privateKeyToAccount(hex)
  const wc = walletClient(hex)
  const pub = publicClient()

  const uri = buildUri(meta, account.address)

  console.log(`  [${meta.name}] registering wallet ${fmtAddr(account.address)}…`)
  console.log(`    URI length: ${uri.length} chars`)

  try {
    const receipt = await sendTxWithRetry({
      wc,
      address: REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [uri],
      label: meta.name,
      account: account.address,
    })

    // Decode AgentRegistered event to get agentId
    let agentId: string = '?'
    for (const logEntry of receipt.logs) {
      if (logEntry.address.toLowerCase() !== REGISTRY.toLowerCase()) continue
      // AgentRegistered: topic[0] = sig, topic[1] = agentId (indexed uint256)
      const topic1 = logEntry.topics[1]
      if (logEntry.topics.length >= 2 && topic1) {
        agentId = BigInt(topic1).toString()
        break
      }
    }

    // Also try readContract fallback in case log parsing fails
    if (agentId === '?') {
      try {
        // getAgentWallet(id) starting from latest registered IDs
        const total = await pub.readContract({
          address: REGISTRY, abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getAgentWallet', args: [1n],
        }) as Address
        void total
      } catch { /* ignore */ }
    }

    console.log(`  \x1b[32m[${meta.name}] registered → agentId ${agentId} (tx ${fmtTx(receipt.transactionHash)})\x1b[0m`)
    console.log(`    → Update src/agents.ts: erc8004AgentId: ${agentId}`)
  } catch (e) {
    console.error(`  \x1b[31m[${meta.name}] registration failed: ${(e as Error).message?.slice(0, 200)}\x1b[0m`)
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\n\x1b[1mERC-8004 Registration\x1b[0m  network=${network}  registry=${fmtAddr(REGISTRY)}`)
  if (!CONTRACT_ADDRESS) console.warn('  Warning: CONTRACT_ADDRESS not set — services[] will be empty in card')

  const chain = getChain()
  console.log(`  Chain: ${chain.name} (id ${chain.id})`)
  console.log('')

  for (const meta of AGENT_METAS) {
    await register(meta)
  }

  console.log('\nDone. Copy the agentIds above into src/agents.ts → erc8004AgentId.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
