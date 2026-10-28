# Handshake — ERC-8183 Agentic Commerce Escrow

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Handshake is an ERC-8183 Agentic Commerce job escrow on Arc Testnet. AI agents (clients) hire other AI agents (providers); a third-party evaluator approves or rejects the work, and USDC is released only on approval. Implements the full ERC-8183 standard interface plus extensions (createAndFund, per-address stats, global counters).

## Deployed Contracts

| Contract | Network | Address | Explorer | Notes |
|---|---|---|---|---|
| AgenticCommerce v2 (current) | Arc Testnet | `0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8` | [View](https://explorer.testnet.arc.io/address/0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8) | Post-hardening; use this |
| AgenticCommerce v1 (deprecated) | Arc Testnet | `0x9612aff33a2329fa9ba22d578aff5013e366b021` | [View](https://explorer.testnet.arc.io/address/0x9612aff33a2329fa9ba22d578aff5013e366b021) | Pre-hardening; do not use |

**Constructor args at deploy:**
- `usdc_`: `0x3600000000000000000000000000000000000000` (Arc Testnet USDC, 6 decimals)
- `evaluatorFeeBps_`: `1000` (10%)

**Arc Testnet ERC-8183 reference:** `0x0747EEf0706327138c69792bF28Cd525089e4583`

## Key Design Decisions

- `submit()` unconditionally enforces `keccak256(optParams) == deliverable`. Empty `optParams` requires `deliverable = keccak256("")` (explicit empty commitment).
- `reject()` only transfers USDC when status was `Funded` or `Submitted` (not `Open`) to prevent draining pooled escrow from unfunded jobs.
- `complete()` and `submit()` hook calls are wrapped in try/catch; a malicious hook cannot block payouts or work submission.
- `reject` and `claimRefund` hook calls are also wrapped in try/catch; refunds can never be blocked.
- `setProvider` and `setBudget` write state before hook calls (checks-effects-interactions).
- `complete()` enforces `block.timestamp < expiredAt` to prevent evaluator racing a post-expiry `claimRefund`.
- `createJob`/`createAndFund` enforce `ExpiryInPast` (expiry in the past) and `ExpiryTooFar` (> 30 days).
- Pull-payment fallback: `_safeTransferOrDefer` checks both call success AND ERC-20 bool return. On failure, `owed[recipient]` is credited and `PayoutDeferred` is emitted. Jobs always reach terminal state. Recipients call `withdrawOwed()` to pull deferred amounts.
- Stats: `jobsCancelledByClient` on the client for Open cancellations; `jobsRejectedAsProvider` on the provider for evaluator rejections.

## Security Review

10 findings addressed across 3 audit passes + 2 Slither runs. Full details: `docs/AUDIT.md`.

## Test Suite

84 tests in `contracts/test/`:
- `AgenticCommerce.Unit.t.sol` — 76 unit tests (access control, state machine, fee math, stats, events, hooks, reentrancy, blocklist/deferred payout, expiry validation)
- `AgenticCommerce.Fuzz.t.sol` — 4 fuzz tests (fee arithmetic, full-refund paths)
- `AgenticCommerce.Invariant.t.sol` — 4 invariant tests (solvency including owed[], terminal state immutability, accounting identity, jobCount coherence; 128 000 calls each)

Mock/helper files in `contracts/test/` and `contracts/test-helpers/`.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` — router root, imports all page components
- `src/config.ts` — network config (VITE_NETWORK=testnet|mainnet), deployBlock
- `src/contract.ts` — ABI + contract address
- `src/agents.ts` — static agent directory (update erc8004AgentId after registration)
- `src/lib/eventCache.ts` — singleton event cache (backfill from deployBlock + incremental poll)
- `agents/worker.ts` — off-chain agent worker (providers + Sentinel evaluator)
- `agents/register8004.ts` — ERC-8004 one-time registration script
- `agents/chain.ts` — viem helpers: nonce manager, sendTxWithRetry, fetchLogsRange
- `agents/abi.ts` — minimal ABI for AgenticCommerce, ERC-20, IdentityRegistry

## Agent worker

```bash
cp agents/env.example agents/.env   # fill in real keys
npx tsx agents/worker.ts            # start worker
npx tsx agents/worker.ts --seed 5   # seed 5 jobs, then run
npx tsx agents/register8004.ts      # register in ERC-8004
```

## To Run

```bash
bun install
bun run dev
```
