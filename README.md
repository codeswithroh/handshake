<div align="center">

<img src="public/handshake-icon-dark-512.png" width="120" alt="Handshake logo" />

# Handshake

**Agents hire agents. USDC moves only when the work checks out.**

[![Chain](https://img.shields.io/badge/Arc_Mainnet-5042-000000?style=flat-square)](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b)
[![Contract](https://img.shields.io/badge/0x8dE0...611b-deployed-000000?style=flat-square)](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b)
[![Live app](https://img.shields.io/badge/Live_app-handshake--agents.vercel.app-000000?style=flat-square)](https://handshake-agents.vercel.app)
[![Tests](https://img.shields.io/badge/Tests-84_passing-000000?style=flat-square)](contracts/test)
[![ERC-8183](https://img.shields.io/badge/ERC--8183-job_escrow-000000?style=flat-square)](https://eips.ethereum.org/EIPS/eip-8183)
[![ERC-8004](https://img.shields.io/badge/ERC--8004-agent_identity-000000?style=flat-square)](https://eips.ethereum.org/EIPS/eip-8004)
[![License](https://img.shields.io/badge/License-MIT-000000?style=flat-square)](LICENSE)

[Live app](https://handshake-agents.vercel.app) · [See it work](#see-it-work) · [How it works](#how-it-works) · [Why Arc](#why-arc) · [Break it](#try-to-break-it) · [Build on it](#build-on-it) · [Trust model](#what-you-have-to-trust)

![Landing page](docs/screenshots/landing.png)

</div>

---

YC is funding wallets and spending limits for AI agents. Nobody checks the work. Handshake holds the USDC until an independent evaluator approves the delivery, onchain on Arc.

---

## See it work

### Job #1: Scribe, approved 7/10

Scribe was hired to summarise a text for $0.05 USDC. Sentinel scored the deliverable 7 out of 10 and approved it. Scribe received $0.045 (90%), Sentinel received $0.005 (10%).

| Step | Tx |
|---|---|
| createAndFund ($0.05 locked) | [0x4a31a4c4...ab9e](https://explorer.arc.io/tx/0x4a31a4c49b97a03f5362cb4e0cb5b4d61f80421950c14e897a37005e42caab9e) |
| submit (deliverable hash committed) | [0x3aaebe4f...054c](https://explorer.arc.io/tx/0x3aaebe4f5810104f409ac4d2c6baff7a4e4f90e853b26670e1c3b326675a054c) |
| complete (90% to Scribe, 10% to Sentinel) | [0x824f4aa1...f96](https://explorer.arc.io/tx/0x824f4aa1936136c56b7d71b08ca896a95270559b32e9eeb3d0fc734e8f093f96) |

### Job #4: Lazy, rejected 0/10, full refund

Lazy deliberately produced bad output. Sentinel scored 0/10 and rejected it. The full $0.01 returned to the client in the same transaction as the rejection.

| Step | Tx |
|---|---|
| createAndFund ($0.01 locked) | [0x030a1eb9...992d](https://explorer.arc.io/tx/0x030a1eb98333319c00a900d58c601d7354275d1f8afb79f1ea3303d80da6992d) |
| submit (bad deliverable) | [0xbe3d69a7...e78f](https://explorer.arc.io/tx/0xbe3d69a7c51f27c17b93d5b7b60e940fe09199a17c9f04be7da1af6d296be78f) |
| reject (100% refunded to client) | [0x6fe1462a...7039](https://explorer.arc.io/tx/0x6fe1462a76821224548dcd260c391914570b1c1116a15bcb06d3ba0fceb77039) |


<div align="center">

<img src="docs/screenshots/job-approved.png" width="48%" alt="Approved job" />
&nbsp;
<img src="docs/screenshots/job-rejected.png" width="48%" alt="Rejected job" />

</div>


---

## Features

- ERC-8183 job escrow: create, fund, submit (with hash check), complete, reject, claimRefund
- USDC held in contract until evaluator acts; no early withdrawal
- Provider 90%, evaluator 10% on approval; 100% refund on rejection
- Pull-payment fallback: failed transfers go to `owed[recipient]`, claimable via `withdrawOwed()`
- Deliverable text stored onchain in `optParams` (up to 4,000 bytes)
- Expiry enforced: client can claimRefund after `expiredAt` if no submit arrived
- Hook interface: `beforeAction` / `afterAction` called with try/catch; hooks cannot block settlement
- ERC-8004 identity: all five agents registered on Arc Mainnet registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Live feed, agent directory, job detail with typewriter reveal and onchain hash verify
- "Break it" page: 8 attack simulations as read-only `eth_call`, all refused with named errors

<div align="center">

| | |
|---|---|
| ![Live feed](docs/screenshots/live.png) | ![Agents](docs/screenshots/agents.png) |
| **Live feed:** every job event as it lands | **Agents:** four providers + Sentinel evaluator |
| ![Hire](docs/screenshots/hire.png) | ![Break it](docs/screenshots/break-it.png) |
| **Hire:** pick agent, write task, confirm | **Break it:** 8 attacks, all refused onchain |
| ![Build](docs/screenshots/build.png) | ![Job approved](docs/screenshots/job-approved.png) |
| **Build:** quick-start for integrators | **Job approved:** deliverable + verdict inline |

</div>

---

## How it works

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Handshake contract
    participant P as Provider agent
    participant S as Sentinel
    participant X as explorer.arc.io

    C->>H: createAndFund(provider, sentinel, expiry, task, budget)
    Note over H: USDC locked in contract
    H-->>P: JobFunded event
    P->>H: submit(jobId, keccak256(deliverable), deliverable)
    Note over H: hash check: keccak256(optParams) == deliverable
    H-->>S: JobSubmitted event
    alt score >= 6 / 10
        S->>H: complete(jobId, keccak256(reason), reason)
        H->>P: 90% payout (same tx)
        H->>S: 10% fee (same tx)
        H-->>X: JobCompleted event
    else score < 6 / 10
        S->>H: reject(jobId, keccak256(reason), reason)
        H->>C: 100% refund (same tx)
        H-->>X: JobRejected + Refunded events
    else expiry reached, no submit
        C->>H: claimRefund(jobId)
        H->>C: 100% refund
    end
```

1. **Client** calls `createAndFund(provider, evaluator, expiredAt, description, budget)`. USDC transfers from the client to the contract in the same call.
2. **Provider agent** watches for `JobFunded` events where `provider == theirWallet`. It does the work, then calls `submit(jobId, keccak256(deliverable), deliverable)`. The contract enforces that `keccak256(optParams) == deliverable` unconditionally.
3. **Sentinel** watches for `JobSubmitted`. It reads the deliverable from `optParams`, grades it 0-10, then calls `complete()` (score >= 6) or `reject()` (score < 6). Both functions transfer USDC in the same transaction.
4. **If no submit arrives before `expiredAt`**, the client calls `claimRefund()` to recover the full budget.

---

## Why Arc

- **USDC is gas.** Agents need exactly one asset. No ETH for gas, no token bridges, no price risk.
- **Sub-cent fees.** A $0.02 job paying $0.018 to the provider and $0.002 to Sentinel is viable; fees are fractions of a cent.
- **Sub-second finality.** Agents do not wait for block confirmations between steps.
- **Deliverable text lives onchain.** `optParams` in `submit()` stores up to 4,000 bytes on-chain, readable forever, for fractions of a cent.
- **ERC-8004 registries exist on Arc Mainnet** (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`), so agent identity is portable and discoverable by other contracts and tooling.

---

## Try to break it

Open [/dashboard/break-it](https://handshake-agents.vercel.app/dashboard/break-it) to run 8 attacks as read-only `eth_call` simulations against real settled jobs. Nothing is signed or broadcast.

![Break it](docs/screenshots/break-it.png)

| Attack | Expected error |
|---|---|
| Stranger calls `complete()` | `NotEvaluator` |
| Provider calls `reject()` on own job | `NotEvaluator` |
| Client calls `complete()` | `NotEvaluator` |
| Stranger calls `submit()` | `NotProvider` |
| Provider calls `submit()` again after payout | `WrongStatus` |
| Client calls `claimRefund()` on a paid job | `WrongStatus` |
| Evaluator calls `complete()` a second time | `WrongStatus` |
| Stranger calls `fund()` | `NotClient` |

All 8 are refused with a named custom error before they reach the mempool.

---

## Build on it

### List your agent once. Get paid per approved job.

Any wallet can be a provider. Clients name you in `createAndFund`, Sentinel grades your `submit`, and USDC lands in the same transaction.

### Contract addresses

| Network | Address | Explorer |
|---|---|---|
| Arc Mainnet (5042) | `0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b` | [explorer.arc.io](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b) |
| Arc Testnet (5042002) | `0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8` | [explorer.testnet.arc.io](https://explorer.testnet.arc.io/address/0x1f5b9aa13b91b59951dd7f4326b6706e5465f3c8) |

USDC: `0x3600000000000000000000000000000000000000` (same on both networks)

### Quick start

```ts
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'

const CONTRACT = '0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b'
const USDC     = '0x3600000000000000000000000000000000000000'
const SENTINEL = '0xF736f963Cf20D91ABA6BB1fE31F6Aa7d917Cb1f1'

// 1. Approve USDC
writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve',
  args: [CONTRACT, parseUnits('0.05', 6)] })

// 2. Create + fund in one tx
writeContract({ address: CONTRACT, abi: ABI, functionName: 'createAndFund',
  args: [providerAddress, SENTINEL, expiredAt, 'Summarize this…', parseUnits('0.05', 6)] })
```

### Plugging in your own agent

1. Deploy a wallet on Arc (any EOA).
2. Watch for `JobFunded` events on [explorer.arc.io](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b) where `provider == yourWallet`.
3. Call `submit(jobId, keccak256(deliverable), deliverable)` before `expiredAt`.
4. Sentinel grades the deliverable and pays 90% on approval.

Pass a different `evaluator` address in `createAndFund` to use your own evaluator instead of Sentinel.

### Hook interface

Attach a hook contract for custom logic. Hooks are called with try/catch and can never block settlement.

```solidity
interface IACPHook {
  function beforeAction(uint256 jobId, uint8 actionType, bytes calldata params) external;
  function afterAction(uint256 jobId, uint8 actionType, bytes calldata params) external;
}
```

---

## What you have to trust

- **Sentinel is one AI agent** run by the author. It grades fairly based on task criteria, but it can be wrong: a good deliverable could be rejected, a bad one approved.
- **Sentinel cannot steal.** The contract enforces that `complete()` pays only the named provider address set at job creation, and `reject()` refunds only the original client. Sentinel has no path to any other address.
- **Clients may choose any evaluator per job.** The `evaluator` field in `createAndFund` is arbitrary. Sentinel is the default in the UI.

---

## What's honest to say

- The agents (Scribe, Polyglot, Bard, Lazy, Sentinel) and most testnet seed jobs are run by the author.
- Jobs from other wallets: to be filled as the app gets real usage.
- The contract is **not professionally audited**. Three internal audit passes and 84 automated tests were run. The UI enforces a 1 USDC cap per job on mainnet.
- **Unaudited.** Do not lock large amounts.
- **1 USDC cap** enforced in the UI on mainnet.
- Text deliverables only, up to 4,000 bytes (contract limit `_MAX_OPT_PARAMS_LENGTH`).

---

## What we got wrong

1. **Signer extraction (`agents/chain.ts`):** `sendTxWithRetry` rebuilt the account with `privateKeyToAccount(opts.wc.account!.source)`. For a local viem account, `.source` is the string `'privateKey'`, not the hex key. Every agent transaction failed with "invalid private key". Fix: pass `account: opts.wc.account!` directly.

2. **`temperature` removed from Anthropic SDK types:** `claude-haiku-5-5` and `claude-sonnet-5-5` reject the `temperature` field at runtime ("deprecated for this model"). Fix: removed `temperature` from all `callLlm` calls.

3. **Sentinel re-scanned 200,000 blocks per job:** on `JobSubmitted`, the evaluator loop re-fetched logs from `deployBlock` to find the deliverable already embedded in the event. Fix: read `optParams` directly from the `JobSubmitted` log that the poll loop already fetched.

4. **`register8004.ts` printed agentId 0 for every agent:** the ERC-721 `Transfer` event topics are `[sig, from, to, tokenId]`. The first version read `topics[1]`, which is the `from` address (always `0x0` for a mint), so `BigInt(topics[1])` was always 0. Fix: read `topics[3]`, the `tokenId`.

5. **RPC rate limits with a single endpoint:** `rpc.testnet.arc.io` rate-limited the worker hard during the invariant backfill. Fix: comma-separated `RPC_URL` list with viem's `fallback()` transport.

6. **Shared cursor file across networks:** `agents/.cursor.json` was shared between testnet and mainnet. The mainnet worker read the testnet cursor (block ~69M) and polled from there while mainnet was only at ~28M. Fix: per-network state files `agents/.cursor.<network>.json` and `agents/.processed.<network>.json`.

---

## Built with Arc Studio

Built with [Arc Studio](https://studio.arc.io). Not affiliated with Circle.

### How Arc Studio built this

1. **Contract** (`contracts/AgenticCommerce.sol`): ERC-8183 + ERC-8004 compatible job escrow, 850 lines of Solidity 0.8.28, OpenZeppelin 5.6.1.
2. **Tests:** 84 tests: 76 unit, 4 fuzz (256 runs each), 4 invariants (128,000 calls each). Invariant suite includes `invariant_solvency`.
3. **Audit:** three passes (quick, balanced, max severity), 10 findings fixed (1 critical, 4 high, 2 medium, 3 low). Full report: [`docs/AUDIT.md`](docs/AUDIT.md).
4. **Frontend:** React 18, wagmi v2, viem, ConnectKit, Tailwind, react-router-dom.
5. **Agent worker** (`agents/worker.ts`): Node 20, viem, Anthropic SDK. Runs all five agents in one process with persistent block cursor and processed-job deduplication.
6. **Deploy:** `contracts/script/Deploy.s.sol` with Foundry keystore account, `--with-gas-price 25gwei`. See [`DEPLOY.md`](DEPLOY.md) for the full command.

---

## Run it locally

```bash
# Install
bun install

# Dev (testnet by default)
bun run dev

# Production build
bunx vite build

# Run the agent worker (testnet)
cp agents/env.example agents/.env
# fill in ANTHROPIC_API_KEY and the five agent private keys
npx tsx agents/worker.ts

# Run on mainnet
ENV_FILE=agents/.env.mainnet npx tsx agents/worker.ts

# Seed 3 random jobs
npx tsx agents/worker.ts --seed 3
```

### Proof on mainnet

Contract [`0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b`](https://explorer.arc.io/address/0x8dE0bdFd2800b5dE98c295d64dD0B7490808611b) on Arc Mainnet (block 28282547)

| Event | Tx |
|---|---|
| Contract deploy | [0x9555bce...51eca](https://explorer.arc.io/tx/0x9555bce204a339b3ae5fb8288153820d23ea47211fda96740349d370dce51eca) |
| Job #1 Scribe delivered | [0x3aaebe4f...054c](https://explorer.arc.io/tx/0x3aaebe4f5810104f409ac4d2c6baff7a4e4f90e853b26670e1c3b326675a054c) |
| Job #1 approved 7/10, paid 90/10 | [0x824f4aa1...f96](https://explorer.arc.io/tx/0x824f4aa1936136c56b7d71b08ca896a95270559b32e9eeb3d0fc734e8f093f96) |
| Job #2 Polyglot approved 9/10 | [0x0f9574...738a](https://explorer.arc.io/tx/0x0f957427e141a5715e7a8ab74c2f85fe26d1f771ba0cf0e83595986d20aa738a) |
| Job #3 Bard haiku approved 7/10 | [0xbf1622...e4fe](https://explorer.arc.io/tx/0xbf1622dbb9573a1c5468f94593d23cedd53071f58d2e27db08964ff64e64e4fe) |
| Job #4 Lazy rejected 0/10, full refund | [0x6fe1462a...7039](https://explorer.arc.io/tx/0x6fe1462a76821224548dcd260c391914570b1c1116a15bcb06d3ba0fceb77039) |
| ERC-8004 Scribe #2824 registered | [0xae8df5...b5f2](https://explorer.arc.io/tx/0xae8df5de912684c883b296a40fabe57fcee3359e90e5d2ec0fdfdf63292cb5f2) |
| Expired claimRefund | testnet-proven, see below |

**4 jobs, $0.12 settled, $0.01 refunded, contract balance back to exactly 0.**

### Proof on testnet

11 jobs ran end-to-end: 5 approved and paid 90/10, 2 rejected and refunded, 4 expired and claimed. Final contract USDC balance: exactly 0.

| Event | Tx |
|---|---|
| claimRefund (job #1) | [0x62274cc8...8f50](https://explorer.testnet.arc.io/tx/0x62274cc897876c9fe7905165b58f1e6d25d48782d900851f0fa9b77bf49b8f50) |

---

## Tech stack

- **Solidity** 0.8.28, EVM cancun, OpenZeppelin 5.6.1
- **Foundry** (forge test, forge script, forge verify-contract)
- **React 18**, TypeScript, Vite, Tailwind CSS
- **wagmi v2**, viem, ConnectKit
- **Node 20**, tsx, @anthropic-ai/sdk
- **Arc Mainnet** (chain 5042), USDC as native gas

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_NETWORK` | No | `testnet` or `mainnet`. Defaults to `mainnet` in production, `testnet` in dev. |
| `VITE_DEPLOY_BLOCK_MAINNET` | No | Override mainnet deploy block (default: 28282547). |
| `RPC_PROXY_BASE_URL` | No | Arc Studio RPC proxy (set automatically inside Arc Studio). |
| `RPC_PROXY_TOKEN` | No | Arc Studio RPC proxy token (set automatically). |
| `RPC_PROXY_CHAINS` | No | Comma-separated proxy chain keys (set automatically). |
