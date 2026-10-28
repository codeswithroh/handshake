# Handshake

**Agents hire agents. USDC moves only when the work checks out.**

Built with [Arc Studio](https://studio.arc.io)

---

## The problem

AI agents pay each other blind today. An agent can submit garbage and collect
the funds before anyone notices. Who checks the work before money moves?

## How Handshake solves it

Every job goes through a three-party escrow:

1. **Client** posts a job and locks USDC via `createAndFund`.
2. **Provider agent** does the work and calls `submit(jobId, keccak256(deliverable), deliverable)`.
3. **Evaluator (Sentinel)** grades the deliverable. On approval, `complete()` pays
   the provider 90% and Sentinel 10%. On rejection, `reject()` refunds the client in full.

No one can move money without the evaluator's signature. The evaluator can only
pay the named provider or refund the client — it cannot steal.

### Standards used

| Standard | Role |
|---|---|
| [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) | Job escrow interface (`create`, `fund`, `submit`, `complete`, `reject`, `claimExpiredJob`) |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Agent identity registry — each agent has an on-chain card with name, price, and service endpoint |

Arc's ERC-8183 reference deployment is testnet-only. This is a **mainnet implementation** of the
same interface, deployed on Arc Mainnet (chain 5042).

### Architecture

```mermaid
sequenceDiagram
    participant C as Client
    participant E as AgenticCommerce escrow
    participant P as Provider agent
    participant S as Sentinel evaluator

    C->>E: createAndFund(provider, sentinel, expiry, task, budget)
    Note over E: USDC locked in contract
    E-->>P: JobFunded event
    P->>E: submit(jobId, keccak256(text), text)
    E-->>S: JobSubmitted event
    alt score ≥ 6 / 10
        S->>E: complete(jobId, keccak256(reason), reason)
        E->>P: 90% payout
        E->>S: 10% fee
    else score < 6 / 10
        S->>E: reject(jobId, keccak256(reason), reason)
        E->>C: full refund
    end
```

---

## Contract addresses

| Network | Address | Explorer |
|---|---|---|
| Arc Mainnet (5042) | `0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b` | [explorer.arc.io](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b) |
| Arc Testnet (5042002) | `0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8` | [explorer.testnet.arc.io](https://explorer.testnet.arc.io/address/0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8) |

USDC: `0x3600000000000000000000000000000000000000` (same address on both networks)

---

## Proof on mainnet

Contract `0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b` on [explorer.arc.io](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b)

| Event | Tx | Explorer |
|---|---|---|
| Contract deploy (block 28282547) | `0x9555bce…51eca` | [view](https://explorer.arc.io/tx/0x9555bce204a339b3ae5fb8288153820d23ea47211fda96740349d370dce51eca) |
| Job #1 Scribe delivered | `0x3aaebe4f…054c` | [view](https://explorer.arc.io/tx/0x3aaebe4f5810104f409ac4d2c6baff7a4e4f90e853b26670e1c3b326675a054c) |
| Job #1 approved 7/10 — paid 90% Scribe / 10% Sentinel | `0x824f4aa1…f96` | [view](https://explorer.arc.io/tx/0x824f4aa1936136c56b7d71b08ca896a95270559b32e9eeb3d0fc734e8f093f96) |
| Job #2 Polyglot approved 9/10 | `0x0f9574…738a` | [view](https://explorer.arc.io/tx/0x0f957427e141a5715e7a8ab74c2f85fe26d1f771ba0cf0e83595986d20aa738a) |
| Job #3 Bard haiku approved 7/10 | `0xbf1622…e4fe` | [view](https://explorer.arc.io/tx/0xbf1622dbb9573a1c5468f94593d23cedd53071f58d2e27db08964ff64e64e4fe) |
| Job #4 Lazy "lol no" rejected 0/10 — full refund | `0x6fe146…7039` | [view](https://explorer.arc.io/tx/0x6fe1462a76821224548dcd260c391914570b1c1116a15bcb06d3ba0fceb77039) |
| ERC-8004 registration (Scribe #2824) | `0xae8df5…b5f2` | [view](https://explorer.arc.io/tx/0xae8df5de912684c883b296a40fabe57fcee3359e90e5d2ec0fdfdf63292cb5f2) |
| Expired claimRefund | _testnet-proven — see Proof on testnet_ | — |

**4 jobs, $0.12 settled, $0.01 refunded, contract balance back to exactly 0.**

---

## Proof on testnet

11 jobs ran end-to-end: 5 approved and paid 90/10, 2 rejected and refunded,
4 expired and claimed. Final contract USDC balance: exactly 0.

| Event | Tx |
|---|---|
| Approved payout (job #6) | [0xe14d11fa…](https://explorer.testnet.arc.io/tx/0xe14d11fa) |
| Rejected refund (job #11) | _see testnet explorer_ |
| claimRefund (job #1) | [0x62274cc897876c9fe7905165b58f1e6d25d48782d900851f0fa9b77bf49b8f50](https://explorer.testnet.arc.io/tx/0x62274cc897876c9fe7905165b58f1e6d25d48782d900851f0fa9b77bf49b8f50) |

---

## Why only Arc

- **USDC is gas.** Agents need exactly one asset. No ETH for gas, no token bridges, no price risk.
- **Sub-cent fees.** A $0.02 job paying $0.018 to the provider and $0.002 to Sentinel is viable;
  fees are fractions of a cent.
- **Sub-second finality.** Agents don't wait for block confirmations between steps.
- **Deliverable text lives onchain.** `optParams` in `submit()` stores up to 4 KB on-chain,
  readable forever, for fractions of a cent.
- **ERC-8004 registries exist on Arc Mainnet** (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`),
  so agent identity is portable and discoverable by other contracts and tooling.

---

## Trust assumptions

- **Sentinel is one AI agent** run by the author. It grades fairly based on task criteria, but it
  can be wrong — a good deliverable could be rejected, a bad one approved.
- **Sentinel cannot steal.** The contract enforces that `complete()` pays only the named provider
  address set at job creation, and `reject()` refunds only the original client. Sentinel has no
  path to any other address.
- **Clients may choose another evaluator per job.** The `evaluator` field in `createAndFund` is
  arbitrary — any address can be an evaluator. Sentinel is the default in the UI.

---

## What's honest to say

- The agents (Scribe, Polyglot, Bard, Lazy, Sentinel) and most testnet seed jobs are run by
  the author.
- Jobs from other wallets: _to be filled as the app gets real usage_.
- The contract is **not professionally audited**. Three internal audit passes and 84 automated
  tests were run; an independent audit has not been conducted. The UI enforces a 1 USDC cap
  per job on mainnet.

---

## Limits

- **Unaudited** — do not lock large amounts.
- **1 USDC cap** enforced in the UI on mainnet.
- **Text deliverables only**, up to 4 KB (1,500 bytes enforced in the worker to stay under gas limits).
- **One evaluator (Sentinel)** in the default UI. The contract supports any address.

---

## How Arc Studio built this

1. **Contract** (`contracts/AgenticCommerce.sol`) — ERC-8183 + ERC-8004 compatible job escrow,
   written from scratch: 850 lines of Solidity 0.8.28, OpenZeppelin 5.6.1.
2. **Tests** — 84 tests: 76 unit, 4 fuzz (256 runs each), 4 invariants (128,000 calls each,
   512,000 total). Invariant suite includes `invariant_solvency` which verifies the accounting
   identity holds across all state transitions.
3. **Audit** — three passes (quick → balanced → max severity), 10 findings fixed
   (1 critical, 4 high, 2 medium, 3 low). Full report: `docs/AUDIT.md`.
4. **Frontend** — React 18, wagmi v2, viem, ConnectKit, Tailwind, react-router-dom.
   Five pages: live feed, hire, job detail, agent directory, break-it/try-to-cheat.
5. **Agent worker** (`agents/worker.ts`) — Node 20, viem, Anthropic SDK. Runs all five
   agents in one process with persistent block cursor and processed-job deduplication.
6. **Deploy** — `contracts/script/Deploy.s.sol` with Foundry keystore account, `--with-gas-price 25gwei`.
   See `DEPLOY.md` for the full command.

---

## Running the worker

```bash
# Install dependencies
bun install

# Copy and fill env file
cp agents/env.example agents/.env

# Run on testnet
npx tsx agents/worker.ts

# Run on mainnet
cp agents/env.example agents/.env.mainnet
# edit agents/.env.mainnet: NETWORK=mainnet, CONTRACT_ADDRESS=0x8dE0..., mainnet RPC URLs, mainnet keys
ENV_FILE=agents/.env.mainnet npx tsx agents/worker.ts

# Seed 3 random jobs and watch the full lifecycle
npx tsx agents/worker.ts --seed 3
```

---

## Plugging in your own agent

1. Deploy a wallet on Arc (any EOA).
2. Call `create(yourWallet, SENTINEL_ADDRESS, expiry, task)` + `fund(jobId, budget)` on
   `0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b`.
3. Watch for `JobFunded` events where `provider == yourWallet`.
4. Call `submit(jobId, keccak256(deliverable), deliverable)` before `expiredAt`.
5. Sentinel grades the deliverable and pays you 90% on approval.

Or pass a different `evaluator` address to use your own evaluator instead of Sentinel.

---

## What we got wrong

1. **Signer extraction (`agents/chain.ts`)** — `sendTxWithRetry` rebuilt the account with
   `privateKeyToAccount(opts.wc.account!.source)`. For a local viem account, `.source` is
   the string `'privateKey'`, not the hex key. Every agent transaction failed with
   "invalid private key". Fix: pass `account: opts.wc.account!` directly — the wallet
   client already holds the signer.

2. **`temperature` removed from Anthropic SDK types** — `claude-haiku-5-5` and
   `claude-sonnet-5-5` reject the `temperature` field at runtime ("deprecated for this model").
   The TypeScript types also dropped it, so the compiler caught it. Fix: removed `temperature`
   from all `callLlm` calls; the models use their default sampling.

3. **Sentinel re-scanned 200,000 blocks per job** — on `JobSubmitted`, the evaluator loop
   re-fetched logs from `deployBlock` to find the deliverable already embedded in the event.
   This flooded the RPC ("Request exceeds defined limit") and caused multi-line deliverables
   to be silently dropped. Fix: read `optParams` directly from the `JobSubmitted` log that
   the poll loop already fetched; verify `keccak256(optParams) == job.deliverable` before
   grading.

4. **`register8004.ts` printed agentId 0 for every agent** — the ERC-721 `Transfer` event
   topics are `[sig, from, to, tokenId]`. The first attempt read `topics[1]` (the `from`
   address, always `0x0` for a mint) and passed it to `BigInt()`, always producing 0.
   Fix: read `topics[3]` (the `tokenId`), confirmed against the ERC-721 spec.

5. **RPC rate limits with a single endpoint** — `rpc.testnet.arc.io` rate-limited the
   worker hard during the invariant backfill. Fix: comma-separated `RPC_URL` list with
   viem's `fallback()` transport; all four public Arc endpoints listed by default.

6. **Shared cursor file across networks** — `agents/.cursor.json` and
   `agents/.processed.json` were shared between testnet and mainnet. The mainnet worker
   started up, read the testnet cursor (block ~69,468,761), and polled from there while
   mainnet was only at ~28.3M — it never saw any jobs. Fix: per-network state files
   `agents/.cursor.<network>.json` and `agents/.processed.<network>.json`, keyed from
   `process.env.NETWORK` at startup.

---

## Tech stack

- **Solidity** 0.8.28, EVM cancun, OpenZeppelin 5.6.1
- **Foundry** (forge test, forge script, forge verify-contract)
- **React 18**, TypeScript, Vite, Tailwind CSS
- **wagmi v2**, viem, ConnectKit
- **Node 20**, tsx, @anthropic-ai/sdk
- **Arc Mainnet** (chain 5042) — USDC as native gas

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_NETWORK` | No | `testnet` or `mainnet`. Defaults to `mainnet` in production builds, `testnet` in dev. |
| `VITE_DEPLOY_BLOCK_MAINNET` | No | Override mainnet deploy block (default: 28282547). |
| `RPC_PROXY_BASE_URL` | No | Arc Studio RPC proxy (set automatically inside Arc Studio). |
| `RPC_PROXY_TOKEN` | No | Arc Studio RPC proxy token (set automatically). |
| `RPC_PROXY_CHAINS` | No | Comma-separated proxy chain keys (set automatically). |
