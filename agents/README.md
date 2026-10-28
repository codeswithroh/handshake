# Handshake Agent Worker

Off-chain agent process for the Handshake protocol. Runs all five agents
(Scribe, Polyglot, Bard, Lazy, Sentinel) in a single Node 20 process,
polling the `AgenticCommerce` contract every 2 seconds.

## How it works

**Provider loop** — watches for `JobFunded` events where the `provider`
field matches one of the configured agent wallets, generates a deliverable
with the Anthropic API, and calls `submit()` on the contract.

**Evaluator loop** — watches for `JobSubmitted` events where the `evaluator`
field matches Sentinel's wallet, grades the deliverable against the task
description with the LLM, then calls `complete()` or `reject()`.

**Crash safety** — a block cursor (`agents/.cursor.json`) persists the last
processed block so restarts never double-process. A processed-job set
(`agents/.processed.json`) ensures each job is handled at most once per role.

## Prerequisites

- Node 20 + `npx` (for `tsx` execution)
- Bun 1.x (for `bun install` in the root, which installs `tsx` and `@anthropic-ai/sdk`)
- Five funded wallets on Arc Testnet (one per agent)
- An Anthropic API key

## Setup

```bash
# 1. Install dependencies (from the repo root)
bun install

# 2. Create your env file
cp agents/env.example agents/.env
# Edit agents/.env and fill in all values (see below)
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `NETWORK` | No | `testnet` (default) or `mainnet` |
| `RPC_URL` | No | Overrides the default Arc RPC URL |
| `CONTRACT_ADDRESS` | Yes | AgenticCommerce contract address |
| `DEPLOY_BLOCK` | No | Block to start backfill from (default: 69223525 for testnet v2) |
| `ANTHROPIC_API_KEY` | Yes (for LLM agents) | Anthropic API key |
| `SCRIBE_KEY` | No | Private key for Scribe's wallet |
| `POLYGLOT_KEY` | No | Private key for Polyglot's wallet |
| `BARD_KEY` | No | Private key for Bard's wallet |
| `LAZY_KEY` | No | Private key for Lazy's wallet |
| `SENTINEL_KEY` | No | Private key for Sentinel's wallet |
| `SEEDER_KEY` | No | Private key for the seeder wallet (`--seed` flag); falls back to `SCRIBE_KEY` |

You only need the keys for the agents you want to run — any missing key
disables that agent.

### Funding wallets

Each agent wallet needs USDC for gas. On Arc, USDC is the native gas token.
Fund each address on Arc Testnet from the "Get test USDC" button in Arc Studio
or from the [Circle testnet faucet](https://faucet.circle.com).

## Running

```bash
# Start the worker on testnet (uses agents/.env by default)
npx tsx agents/worker.ts

# Start on mainnet (uses a separate env file)
ENV_FILE=agents/.env.mainnet npx tsx agents/worker.ts

# Start with seeder: post 5 test jobs first, then enter the main loop
npx tsx agents/worker.ts --seed 5

# Register ERC-8004 identities
npx tsx agents/register8004.ts
ENV_FILE=agents/.env.mainnet npx tsx agents/register8004.ts
```

## Registering agents in ERC-8004

After funding the wallets, run the registration script once per network to
get the on-chain agent IDs and update `src/agents.ts`:

```bash
npx tsx agents/register8004.ts
```

Copy the printed `agentId` values into the `erc8004AgentId` field of the
matching entry in `src/agents.ts`.

## Agents

| Agent | Role | Model | Behaviour |
|---|---|---|---|
| Scribe | Provider | claude-haiku-4-5 | 3 bullet-point summary |
| Polyglot | Provider | claude-haiku-4-5 | Translation (infers target language; defaults to Spanish) |
| Bard | Provider | claude-haiku-4-5 | 5-7-5 haiku |
| Lazy | Provider | — | Returns "lol no" without calling the LLM; always gets rejected |
| Sentinel | Evaluator | claude-sonnet-4-5 | Grades deliverables 0-10; approves if score ≥ 6 |

## Log format

```
12:34:56.789 [Bard]     job #12 — "Write a haiku about blockchain and trust."
12:34:57.012 [Bard]     job #12 delivered (tx 0x3f2a1b…) "Chains without trust fail…"
12:34:57.500 [Sentinel] job #12 — evaluating "Chains without trust fail…"
12:34:58.001 [Sentinel] job #12 APPROVED 8/10 → paid $0.018 to 0xBard… (tx 0x9a1c2d…)
12:34:58.002 [Sentinel]   reason: "The haiku is on-topic, well-formed, and follows 5-7-5."
```

## Files

| File | Purpose |
|---|---|
| `worker.ts` | Main process — all five agents, poll loop, seeder |
| `register8004.ts` | One-time ERC-8004 registration for each wallet |
| `abi.ts` | Minimal ABI for AgenticCommerce, ERC-20, and IdentityRegistry |
| `chain.ts` | viem client, nonce manager, `sendTxWithRetry`, log helpers |
| `env.example` | Template for `agents/.env` |
| `.cursor.json` | Persisted block cursor (auto-created; do not delete mid-run) |
| `.processed.json` | Processed job IDs (auto-created; delete to reprocess) |

## What we got wrong

1. **Signer extraction** — `sendTxWithRetry` called `privateKeyToAccount(wc.account!.source)`.
   `.source` is the string `'privateKey'`, not the hex key. Every tx failed with "invalid private key".
   Fix: pass `account: opts.wc.account!` directly.

2. **`temperature` field removed from Anthropic SDK types** — `claude-haiku-5-5` / `claude-sonnet-5-5`
   reject `temperature` at runtime. Removed from all `callLlm` calls.

3. **Sentinel re-scanned 200,000 blocks per job** — flooded the RPC with `eth_getLogs` calls.
   Fix: read `optParams` directly from the `JobSubmitted` log already in memory.

4. **`register8004.ts` printed agentId 0 for every agent** — `Transfer(from, to, tokenId)` has
   tokenId at `topics[3]`, not `topics[1]`. Reading `topics[1]` (the zero `from` address)
   always decoded to 0. Fix: read `topics[3]`.

5. **Shared cursor file across networks** — a single `agents/.cursor.json` was used for both
   testnet and mainnet. The mainnet worker read the testnet cursor (block ~69,468,761) and polled
   from there while mainnet was only at ~28.3M — it never saw any jobs.
   Fix: per-network files `agents/.cursor.<network>.json` and `agents/.processed.<network>.json`,
   both git-ignored via `agents/.cursor.*.json` / `agents/.processed.*.json`.

## Security

- Private keys are read only from `agents/.env` — never hardcoded.
- `agents/.env` is in `.gitignore`; never commit it.
- The Anthropic API key is read only from `agents/.env`.
- Each wallet is a minimal-funding hot wallet used only for testnet. For mainnet,
  use wallets you control from a hardware device or an MPC service.
