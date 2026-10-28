/**
 * Static agent directory.
 * Testnet addresses: real deployed wallets on Arc Testnet.
 * Mainnet addresses: real deployed wallets on Arc Mainnet.
 */

export interface Agent {
  id: string
  name: string
  address: `0x${string}`
  price: bigint         // USDC atomic units (6 dec)
  priceDisplay: string
  description: string
  promptHint: string
  avatarLetter: string
  erc8004AgentId: number | null  // null = not registered on this network
  isChaosMonkey?: boolean
}

export interface Evaluator {
  id: string
  name: string
  address: `0x${string}`
  feeBps: number
  description: string
  erc8004AgentId: number | null
}

// ── Network selector ───────────────────────────────────────────────────────────
// Reads VITE_NETWORK at bundle time (Vite replaces import.meta.env at build).
// Falls back to testnet in dev, mainnet in prod (matching src/config.ts).
const _envDefault = import.meta.env.PROD ? 'mainnet' : 'testnet'
const isMainnet = (String(import.meta.env.VITE_NETWORK ?? _envDefault).toLowerCase()) === 'mainnet'

// ERC-8004 IdentityRegistry explorer base per network
const REGISTRY_EXPLORER = isMainnet
  ? 'https://explorer.arc.io/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/instance'
  : 'https://explorer.testnet.arc.io/token/0x8004A818BFB912233c491871b3d84c89A494BD9e/instance'

/** Returns the explorer URL for a given ERC-8004 agentId, or null if not registered. */
export function agentRegistryUrl(agentId: number | null): string | null {
  if (agentId == null) return null
  return `${REGISTRY_EXPLORER}/${agentId}`
}

// ── Addresses per network ─────────────────────────────────────────────────────
interface AddrPair { testnet: `0x${string}`; mainnet: `0x${string}` }
function addr(p: AddrPair): `0x${string}` {
  return isMainnet ? p.mainnet : p.testnet
}

interface IdPair { testnet: number | null; mainnet: number | null }
function agentId(p: IdPair): number | null {
  return isMainnet ? p.mainnet : p.testnet
}

// ── Sentinel evaluator ─────────────────────────────────────────────────────────
export const SENTINEL: Evaluator = {
  id: 'sentinel',
  name: 'Sentinel',
  address: addr({
    testnet: '0xf4f0C0932Fcd3A8459f799FD3917baB809984913',
    mainnet: '0xF736f963Cf20D91ABA6BB1fE31F6Aa7d917Cb1f1',
  }),
  feeBps: 1000,
  description: 'ERC-8183 evaluator. Reviews deliverables and approves or rejects based on task criteria.',
  erc8004AgentId: agentId({ testnet: null, mainnet: 2828 }),
}

// ── Provider agents ────────────────────────────────────────────────────────────
export const AGENTS: Agent[] = [
  {
    id: 'scribe',
    name: 'Scribe',
    address: addr({
      testnet: '0x064fbddc51bF3CBfd17180Bfc465df1312959935',
      mainnet: '0x480EB711f0D7a470d4A7bd8cf3808DEDd5647DAE',
    }),
    price: 50_000n,   // 0.05 USDC
    priceDisplay: '0.05',
    description: 'Distills any text into three precise bullet points.',
    promptHint: 'Paste or describe the text you want summarized.',
    avatarLetter: 'S',
    erc8004AgentId: agentId({ testnet: null, mainnet: 2824 }),
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    address: addr({
      testnet: '0xaF2D28317eDf987c60FB167ecdD1A450112584e3',
      mainnet: '0x2B197536Da689823c94A442894cdC36a52621a47',
    }),
    price: 50_000n,
    priceDisplay: '0.05',
    description: 'Translates text into any language with tone preservation.',
    promptHint: 'Specify the text and the target language (e.g. "Translate to Spanish:").',
    avatarLetter: 'P',
    erc8004AgentId: agentId({ testnet: null, mainnet: 2825 }),
  },
  {
    id: 'bard',
    name: 'Bard',
    address: addr({
      testnet: '0x129D72edaE70eFF8778851976dc1095a99ad66C4',
      mainnet: '0x4f9176F15B61dCa5F35B464b93B32834b0a72286',
    }),
    price: 20_000n,   // 0.02 USDC
    priceDisplay: '0.02',
    description: 'Composes a haiku about any topic.',
    promptHint: 'Name a topic, mood, or image for the haiku.',
    avatarLetter: 'B',
    erc8004AgentId: agentId({ testnet: null, mainnet: 2826 }),
  },
  {
    id: 'lazy',
    name: 'Lazy',
    address: addr({
      testnet: '0x8e74365589F0E4Be47eB5ae75dC2ABF01E7b85d5',
      mainnet: '0x1A3f02F83A8ae0bab9660DB0488992f5832e9E6C',
    }),
    price: 10_000n,   // 0.01 USDC
    priceDisplay: '0.01',
    description: 'Deliberately bad output. Perfect for testing the reject-and-refund path.',
    promptHint: 'Anything. Lazy will ignore it.',
    avatarLetter: 'L',
    erc8004AgentId: agentId({ testnet: null, mainnet: 2827 }),
    isChaosMonkey: true,
  },
]
