/**
 * Network configuration — switch with VITE_NETWORK=testnet|mainnet
 * Built with Arc Studio — https://studio.arc.io
 */
import { http, createConfig, fallback } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

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

// Mainnet deploy block — required when VITE_NETWORK=mainnet.
// Set VITE_DEPLOY_BLOCK_MAINNET in your .env before switching to mainnet.
const _mainnetDeployBlock = import.meta.env.VITE_DEPLOY_BLOCK_MAINNET
  ? BigInt(String(import.meta.env.VITE_DEPLOY_BLOCK_MAINNET))
  : 0n

const MAINNET_CONFIG: NetworkConfig = {
  chain: arcMainnet,
  chainId: 5042,
  // Replace with deployed mainnet address when ready
  contractAddress: '0x0000000000000000000000000000000000000000',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorerBase: 'https://explorer.arc.io',
  label: 'Arc',
  deployBlock: _mainnetDeployBlock,
}

const env = String(import.meta.env.VITE_NETWORK ?? 'testnet').toLowerCase()
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
