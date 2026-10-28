/**
 * Network configuration — switch with VITE_NETWORK=testnet|mainnet
 * Built with Arc Studio — https://studio.arc.io
 */
import { http, createConfig, fallback } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
// registerChain is a no-op stub in production; tracing module is dev-only.
function registerChain(_chainId: number, _rpcUrl: string): void { /* no-op in prod */ }

// ── Arc Testnet ────────────────────────────────────────────────────
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
})

// ── Arc Mainnet ────────────────────────────────────────────────────
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

// ── Contract addresses per network ────────────────────────────────
export interface NetworkConfig {
  chain: { id: number; rpcUrls: { default: { http: readonly string[] } }; blockExplorers: { default: { url: string } } }
  chainId: number
  contractAddress: `0x${string}`
  usdcAddress: `0x${string}`
  explorerBase: string
  label: string
  deployBlock: bigint
}

const TESTNET_CONFIG: NetworkConfig = {
  chain: arcTestnet,
  chainId: 5042002,
  contractAddress: '0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorerBase: 'https://explorer.testnet.arc.io',
  label: 'Arc Testnet',
  // Block at which AgenticCommerce v2 was deployed (tx 0x8a606…acd30).
  deployBlock: 69223525n,
}

const MAINNET_CONFIG: NetworkConfig = {
  chain: arcMainnet,
  chainId: 5042,
  // AgenticCommerce deployed 2026-10-28, tx 0x9555bce204a339b3ae5fb8288153820d23ea47211fda96740349d370dce51eca
  contractAddress: '0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorerBase: 'https://explorer.arc.io',
  label: 'Arc',
  // Block at which AgenticCommerce was deployed on Arc Mainnet.
  // Override with VITE_DEPLOY_BLOCK_MAINNET if redeployed.
  deployBlock: import.meta.env.VITE_DEPLOY_BLOCK_MAINNET
    ? BigInt(String(import.meta.env.VITE_DEPLOY_BLOCK_MAINNET))
    : 28282547n,
}

// Default to mainnet for production builds; testnet for dev (VITE_NETWORK overrides either way).
const _envDefault = import.meta.env.PROD ? 'mainnet' : 'testnet'
const env = String(import.meta.env.VITE_NETWORK ?? _envDefault).toLowerCase()
export const NETWORK: NetworkConfig = env === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG

// Register for trace labelling
registerChain(NETWORK.chainId, NETWORK.chain.rpcUrls.default.http[0])

const activeChain = env === 'mainnet' ? arcMainnet : arcTestnet

// Public RPC endpoints per network — fallback transport tries each in order.
// Spreading the load across multiple providers avoids rate-limit stalls.
export const TESTNET_RPCS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
]

export const MAINNET_RPCS = [
  'https://rpc.mainnet.arc.io',
  'https://rpc.quicknode.mainnet.arc.io',
  'https://rpc.drpc.mainnet.arc.io',
  'https://rpc.blockdaemon.mainnet.arc.io',
]

export const NETWORK_RPCS = env === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS

const testnetTransport = fallback(TESTNET_RPCS.map(u => http(u)))
const mainnetTransport = fallback(MAINNET_RPCS.map(u => http(u)))

// Both Arc chain IDs are registered so the transports record satisfies wagmi's
// literal union type regardless of which network is active.
export const config = createConfig({
  chains: [activeChain, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: testnetTransport,
    [arcMainnet.id]: mainnetTransport,
    [mainnet.id]: http(),
  },
})

export const TARGET_CHAIN_ID = NETWORK.chainId
