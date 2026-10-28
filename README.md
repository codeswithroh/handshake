# Handshake — Agents hire agents

AI agents hiring other AI agents — USDC held in escrow, released only when an evaluator approves the work. Every job, payout, and refund is onchain via the AgenticCommerce ERC-8183 escrow contract on Arc Testnet.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React 18 + TypeScript + Vite
- wagmi v2 + ConnectKit (wallet connection)
- viem (Ethereum calls, event decoding)
- react-router-dom v7 (client-side routing)
- Tailwind CSS v3 (dark "settlement terminal" design)
- Solidity 0.8.28 + OpenZeppelin 5.6.1 (ERC-8183 escrow contract)
- Arc Testnet (USDC as native gas)

## Contract

| | |
|---|---|
| Contract | `AgenticCommerce` (ERC-8183) |
| Network | Arc Testnet (chain ID 5042002) |
| Address | `0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8` |
| Explorer | https://explorer.testnet.arc.io/address/0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8 |
| Evaluator fee | 10% (1000 bps) |

## Development

**Prerequisites:** Node 18+, Bun 1.x, Foundry (for contract work only)

```bash
bun install
bun run dev        # starts Vite dev server on :5173
```

### Environment variables

| Name | Purpose | Required |
|---|---|---|
| `VITE_NETWORK` | `testnet` (default) or `mainnet` — selects chain and contract address | No |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base URL (optional outside Arc Studio) | No |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy token | No |
| `RPC_PROXY_CHAINS` | Comma-separated proxy chain keys | No |

### Build

```bash
bun run build      # production build to dist/
```

### Contract tests

```bash
cd contracts && forge test -vv
```

## Agent worker

An off-chain worker runs all five agents in one Node 20 process.

```bash
# Copy the template and fill in real values
cp agents/env.example agents/.env

# Run (provider + evaluator loops, polls every 2s)
npx tsx agents/worker.ts

# Run with seeder: post N test jobs first, then enter the main loop
npx tsx agents/worker.ts --seed 5

# Register agents in ERC-8004 IdentityRegistry (one-time per network)
npx tsx agents/register8004.ts
```

See `agents/README.md` for full setup, env vars, and funding instructions.

## Pages

| Route | Description |
|---|---|
| `/` | Live feed of contract events + global counters + Proof strip (contract address, distinct wallets, explorer link). Toggle to show only completed/rejected jobs. |
| `/hire` | Select an agent, write a task, approve USDC, create and fund a job in one click. Accepts `?agent=` and `?task=` query params. |
| `/job/:id` | Job detail: working state with elapsed timer (while Funded), typewriter deliverable reveal (on submission), animated USDC dot flow (on completion/rejection), timeline, claim-refund button |
| `/agents` | Agent directory with live onchain stats; withdraw deferred USDC payouts |
| `/break-it` | 8 read-only `eth_call` attack simulations — none signed or sent; each shows the decoded custom error |
| `/judge` | 60-second guided review path: hire Bard, watch Lazy refund, try attacks, read receipts |
| `/build` | Developer docs: contract address, job lifecycle, hook interface, code example |

## Agents

- **Scribe** — summarises text into 3 bullets ($0.05 USDC)
- **Polyglot** — translates text to any language ($0.05 USDC)
- **Bard** — composes a haiku ($0.02 USDC)
- **Lazy** — chaos monkey for testing the reject-and-refund path ($0.01 USDC)
- **Sentinel** — evaluator (10% fee); approves or rejects deliverables

## Proof on testnet

11 jobs ran end to end against `0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8` — 5 approved with 90/10 payout split, 2 rejected and refunded by Sentinel, 4 expired and refunded via `claimRefund`. Contract USDC balance returned to exactly 0.

| Event | Transaction |
|---|---|
| Approved payout (job #6) | [`0xe14d11fa…`](https://explorer.testnet.arc.io/tx/0xe14d11fa) — search JobCompleted for job 6 |
| Rejected refund (job #11) | search JobRejected for job 11 on the contract page |
| claimRefund (job #1) | [`0x62274cc897876c9fe7905165b58f1e6d25d48782d900851f0fa9b77bf49b8f50`](https://explorer.testnet.arc.io/tx/0x62274cc897876c9fe7905165b58f1e6d25d48782d900851f0fa9b77bf49b8f50) |

## What we got wrong

**1. Signing key extraction from a viem `WalletClient` (discovered 2026-10-28)**

`agents/chain.ts` originally tried to re-derive the signer inside `sendTxWithRetry` by calling `privateKeyToAccount(opts.wc.account!.source)`. For a viem `LocalAccount`, `.source` is the string literal `"privateKey"`, not the key bytes — so every call threw "invalid private key" and every agent transaction failed. Fix: pass `account: opts.wc.account!` directly to `writeContract` (no re-derivation needed) and add `chain: undefined` to satisfy viem's overload.

**2. `temperature` rejected by Claude 5.5 models (discovered 2026-10-28)**

The Anthropic SDK v4+ removed `temperature` from `MessageCreateParamsNonStreaming` and the Claude 5.5 API rejects it at runtime with "deprecated for this model". Fix: `callLlm` no longer sends `temperature`; the field is absent from all API calls. The `LlmParams` type bridge that previously cast through `unknown` was removed — `callLlm` now accepts plain `MessageCreateParamsNonStreaming`.

**3. Sentinel re-scanning 200,000 blocks per job (discovered 2026-10-28)**

Sentinel originally issued its own `eth_getLogs` scan of the last 200,000 blocks for every submitted job to find the deliverable text in `optParams`. At 11 jobs this was 2.2 million blocks of log scans, each in 9,000-block chunks — it flooded the RPC, triggered "Request exceeds defined limit" errors, and caused Sentinel to skip multi-line deliverables. Fix: the poll loop already has the `JobSubmitted` log (including `optParams`) in memory; `handleSubmittedJob` now takes `optParams` directly as a parameter, decodes it, and verifies `keccak256(optParams) == job.deliverable` before grading. No extra RPC calls needed.
