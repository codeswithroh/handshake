/**
 * Static agent directory.
 * Testnet addresses are the real deployed wallets.
 * Mainnet addresses are read from env vars — set VITE_AGENT_*_MAINNET before building for prod.
 */

export interface Agent {
  id: string
  name: string
  address: `0x${string}`
  price: bigint       // USDC atomic units (6 dec)
  priceDisplay: string
  description: string
  promptHint: string
  avatarLetter: string
  erc8004AgentId: number   // set after ERC-8004 registration
  isChaosMonkey?: boolean
}

export interface Evaluator {
  id: string
  name: string
  address: `0x${string}`
  feeBps: number
  description: string
}

// ── Network-aware address helper ───────────────────────────────────────────────
// Reads VITE_NETWORK at runtime so the same bundle can target either network.
const isMainnet = import.meta.env.VITE_NETWORK === 'mainnet'

function addr(testnet: `0x${string}`, mainnetEnvVar: string): `0x${string}` {
  if (isMainnet) {
    const v = import.meta.env[mainnetEnvVar] as string | undefined
    if (!v) console.warn(`[agents] ${mainnetEnvVar} not set — using zero placeholder`)
    return (v ?? '0x0000000000000000000000000000000000000000') as `0x${string}`
  }
  return testnet
}

// ── Sentinel evaluator ─────────────────────────────────────────────────────────
// 10% fee matches contract's evaluatorFeeBps=1000
export const SENTINEL: Evaluator = {
  id: 'sentinel',
  name: 'Sentinel',
  address: addr(
    '0xf4f0C0932Fcd3A8459f799FD3917baB809984913',
    'VITE_SENTINEL_ADDRESS_MAINNET',
  ),
  feeBps: 1000,
  description: 'ERC-8183 evaluator. Reviews deliverables and approves or rejects based on task criteria.',
}

// ── Provider agents ────────────────────────────────────────────────────────────
export const AGENTS: Agent[] = [
  {
    id: 'scribe',
    name: 'Scribe',
    address: addr('0x064fbddc51bF3CBfd17180Bfc465df1312959935', 'VITE_SCRIBE_ADDRESS_MAINNET'),
    price: 50_000n,   // 0.05 USDC
    priceDisplay: '0.05',
    description: 'Distills any text into three precise bullet points.',
    promptHint: 'Paste or describe the text you want summarized.',
    avatarLetter: 'S',
    erc8004AgentId: 0,   // update after running register8004.ts
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    address: addr('0xaF2D28317eDf987c60FB167ecdD1A450112584e3', 'VITE_POLYGLOT_ADDRESS_MAINNET'),
    price: 50_000n,
    priceDisplay: '0.05',
    description: 'Translates text into any language with tone preservation.',
    promptHint: 'Specify the text and the target language (e.g. "Translate to Spanish:").',
    avatarLetter: 'P',
    erc8004AgentId: 0,
  },
  {
    id: 'bard',
    name: 'Bard',
    address: addr('0x129D72edaE70eFF8778851976dc1095a99ad66C4', 'VITE_BARD_ADDRESS_MAINNET'),
    price: 20_000n,   // 0.02 USDC
    priceDisplay: '0.02',
    description: 'Composes a haiku about any topic.',
    promptHint: 'Name a topic, mood, or image for the haiku.',
    avatarLetter: 'B',
    erc8004AgentId: 0,
  },
  {
    id: 'lazy',
    name: 'Lazy',
    address: addr('0x8e74365589F0E4Be47eB5ae75dC2ABF01E7b85d5', 'VITE_LAZY_ADDRESS_MAINNET'),
    price: 10_000n,   // 0.01 USDC
    priceDisplay: '0.01',
    description: 'Deliberately bad output. Perfect for testing the reject-and-refund path.',
    promptHint: 'Anything. Lazy will ignore it.',
    avatarLetter: 'L',
    erc8004AgentId: 0,
    isChaosMonkey: true,
  },
]
