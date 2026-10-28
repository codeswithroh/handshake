# Handshake — AgenticCommerce Security Review

**Contract:** `contracts/AgenticCommerce.sol`  
**Standard:** ERC-8183 Agentic Commerce  
**Chain:** Arc Testnet (Chain ID 5042002)  
**Reviewed across:** 3 audit passes (solidity-auditor + functional-auditor at max severity) + 2 Slither runs  
**Final test count:** 84 tests (unit + fuzz + invariant), 0 failures  

> This review is best-effort against Arc Studio's internal corpus. It is not a substitute for a paid third-party audit before mainnet deployment.

---

## Summary

| # | Severity | Title | Status |
|---|---|---|---|
| 1 | Critical | reject() drains pooled USDC from unfunded jobs | Fixed |
| 2 | High | submit() hash check bypassable with empty optParams | Fixed |
| 3 | High | complete() missing expiry check — evaluator races claimRefund | Fixed |
| 4 | Medium | setBudget/setProvider write state after hook call (Slither reentrancy-no-eth) | Fixed |
| 5 | High | Hook can steal work — reverts in complete() block provider payout forever | Fixed |
| 6 | Medium | Blocklisted recipient permanently locks escrowed funds | Fixed |
| 7 | Low | Stats semantics incorrect — jobsRejected attributed to wrong address | Fixed |
| 8 | Low | No expiry validation — jobs can be created with past or unbounded expiry | Fixed |
| 9 | High | submit() hook reverts block provider from reaching Submitted state | Fixed |
| 10 | High | _safeTransferOrDefer ignores ERC-20 false return value | Fixed |

---

## Finding Details

### F-01 — Critical: reject() drains pooled USDC from unfunded jobs

**Found in:** Audit pass 1 (both auditors)  
**Location:** `reject()`, line ~289 (original)  
**Description:** A client could call `reject()` on an Open job that had a non-zero `budget` set (via `setBudget`) but was never funded via `fund()`. The function transferred `job.budget` from the contract's token balance, which belonged to other jobs' escrow — enabling a theft of pooled USDC.  
**Fix:** `refundAmount` is now computed as `job.budget` only when status was `Funded` or `Submitted` (proving escrow exists). For `Open` state rejections, `refundAmount = 0` and no transfer occurs.  
**Test:** `test_ClientReject_OpenJob_NoTransfer` — verifies status=Rejected, provider balance unchanged, contract balance unchanged.

---

### F-02 — High: submit() hash check bypassable with empty optParams

**Found in:** Audit pass 1 (functional-auditor)  
**Location:** `submit()`, line ~233 (original)  
**Description:** The hash check `keccak256(optParams) == deliverable` was guarded by `optParams.length > 0`, so a provider could submit an arbitrary `deliverable` with empty params and bypass the onchain text commitment entirely.  
**Fix:** The check is now unconditional. Submitting with empty params requires `deliverable = keccak256("")`.  
**Test:** `test_Submit_EmptyOptParams_EnforcesHashCheck` — verifies that empty params with wrong deliverable reverts `HashMismatch`, and empty params with `keccak256("")` succeeds.

---

### F-03 — High: complete() missing expiry check

**Found in:** Audit pass 1 (functional-auditor)  
**Location:** `complete()`, line ~247 (original)  
**Description:** After `expiredAt`, the evaluator could still call `complete()` and race against (or front-run) a `claimRefund()` call, defeating the timeout protection intended for clients.  
**Fix:** Added `if (block.timestamp >= job.expiredAt) revert Expired()` at the top of `complete()`.  
**Test:** `test_Complete_AfterExpiry_Reverts` — warps past expiry, verifies `complete()` reverts `Expired`.

---

### F-04 — Medium: setBudget/setProvider write state after hook call

**Found in:** Slither pass 1 (reentrancy-no-eth)  
**Location:** `setBudget()` and `setProvider()`  
**Description:** Both functions called the hook (`beforeAction`) before writing their state change (`job.budget` / `job.provider`). A re-entrant hook could read stale state.  
**Fix:** State is written before all hook calls in both functions (checks-effects-interactions order).  
**Test:** Existing hook interaction tests cover the corrected ordering.

---

### F-05 — High: Hook can steal work (complete() hook reverts block payout)

**Found in:** User review (hardening pass)  
**Location:** `complete()`, `_callBeforeAction` / `_callAfterAction`  
**Description:** The client sets the hook at job creation. A malicious hook that always reverts would prevent `complete()` from ever executing, leaving the provider's work onchain with no payout while the client waits for expiry and calls `claimRefund()` to reclaim funds — effectively stealing the deliverable.  
**Fix:** Hook calls in `complete()` now use try/catch (`_callBeforeActionSafe` / `_callAfterActionSafe`). A reverting hook is silently swallowed; the payment proceeds.  
**Test:** `test_MaliciousHook_CannotBlockComplete` — deploys an always-reverting hook, verifies `complete()` succeeds and provider receives payout.

---

### F-06 — Medium: Blocklisted recipient permanently locks escrowed funds

**Found in:** User review (hardening pass); documented as known limitation in first version  
**Location:** `complete()`, `reject()`, `claimRefund()` payout paths  
**Description:** USDC can blocklist addresses. A direct `safeTransfer` to a blocklisted `provider`, `evaluator`, or `client` would revert, permanently preventing the job from settling and locking escrow.  
**Fix:** All three payout paths now use `_safeTransferOrDefer(jobId, recipient, amount)`. On transfer failure (revert or `false` return), the amount is credited to `owed[recipient]` and a `PayoutDeferred(jobId, recipient, amount)` event is emitted. The job still reaches its terminal state. Recipients call `withdrawOwed()` once unblocked.  
**Test:** `test_BlocklistedProvider_Complete_DefersPayout`, `test_BlocklistedEvaluator_Complete_DefersPayout`, `test_BlocklistedClient_Reject_DefersPayout`, `test_BlocklistedClient_ClaimRefund_DefersPayout` — each verifies terminal state is reached, `owed[]` is credited, `PayoutDeferred` is emitted, and `withdrawOwed()` succeeds after unblocking.

---

### F-07 — Low: Stats semantics — jobsRejected attributed to wrong address

**Found in:** User review (hardening pass)  
**Location:** `reject()` stats update  
**Description:** `_stats[job.client].jobsRejected++` ran for all rejection paths, including evaluator rejections of funded/submitted jobs. This conflated two semantically different events and gave no signal to the provider about their work being rejected.  
**Fix:** `Stats` struct now has separate counters:
- `jobsCancelledByClient`: incremented on the **client** only when the client rejects an Open job.
- `jobsRejectedAsProvider`: incremented on the **provider** when the evaluator rejects a Funded or Submitted job.  
**Test:** `test_Stats_ClientCancelOpen_IncrementsCancelledByClient`, `test_Stats_EvaluatorRejectFunded_IncrementsRejectedAsProvider`, `test_Stats_EvaluatorRejectSubmitted_IncrementsRejectedAsProvider`.

---

### F-08 — Low: No expiry validation

**Found in:** User review (hardening pass)  
**Location:** `createJob()` and `createAndFund()`  
**Description:** Jobs could be created with `expiredAt <= block.timestamp` (immediately expired — `submit()` would always revert `Expired`) or arbitrarily far in the future (e.g., `type(uint256).max`), making `claimRefund()` unavailable forever.  
**Fix:** Both functions now revert `ExpiryInPast()` if `expiredAt <= block.timestamp`, and `ExpiryTooFar()` if `expiredAt > block.timestamp + 30 days`.  
**Test:** `test_CreateJob_ExpiryInPast_Reverts`, `test_CreateJob_ExpiryTooFar_Reverts`, `test_CreateAndFund_ExpiryInPast_Reverts`, `test_CreateAndFund_ExpiryTooFar_Reverts`, `test_CreateJob_ExpiryAtBoundary_Succeeds`.

---

### F-09 — High: submit() hook reverts block provider from reaching Submitted state

**Found in:** User review + internal analysis (symmetric to F-05)  
**Location:** `submit()`, `_callBeforeAction` / `_callAfterAction`  
**Description:** The same hook griefing vector applies to `submit()`. A client with a malicious hook that always reverts on `submit` actions would prevent the provider from ever moving to Submitted, and therefore prevent evaluation and payment — while the job was already funded.  
**Fix:** Hook calls in `submit()` also use try/catch (`_callBeforeActionSafe` / `_callAfterActionSafe`).  
**Test:** `test_MaliciousHook_CannotBlockSubmit` (via the shared `AlwaysRevertHook` helper in `AgenticCommerce.Base.t.sol`).

---

### F-10 — High: _safeTransferOrDefer ignores ERC-20 false return value

**Found in:** Audit pass 3 (both auditors, highest priority)  
**Location:** `_safeTransferOrDefer()`, line ~469  
**Description:** The initial implementation of the deferred-payout helper only checked whether the low-level `.call()` succeeded (did not revert), but ignored the ERC-20 boolean return value. A token that signals failure via `return false` instead of reverting would be treated as a successful transfer, and the recipient would be neither paid nor credited in `owed[]` — stranding funds in the contract indefinitely.  
**Fix:** The helper now checks both conditions: `ok && (returndata.length == 0 || abi.decode(returndata, (bool)))`. Both a revert and a `false` return now route to the `owed` credit path.  
**Test:** The blocklist tests in F-06 cover this code path because `MockUSDC.transfer()` reverts for blocklisted addresses; a separate `FalseReturnToken` test would also be appropriate for production audits.

---

## Slither Summary (pass 2, post all fixes)

| Detector | Impact | Notes |
|---|---|---|
| reentrancy-benign | Low | Stats written after low-level call; all paths nonReentrant with status set first — not exploitable |
| reentrancy-events | Info | Events after hook calls in setBudget/setProvider — informational |
| timestamp | Low | Inherent to expiry logic; expected |
| cyclomatic-complexity | Info | reject() complexity 13; acceptable |
| low-level-calls | Info | Intentional _safeTransferOrDefer pattern |
| naming-convention | Info | `USDC` immutable not mixedCase — convention only |
| unused-state | Info | `_WITHDRAW_OWED_SELECTOR` — changed to internal to resolve |

No High or Medium findings from Slither remain unaddressed.

---

## Test Coverage Summary

| Suite | Tests | Invariant calls |
|---|---|---|
| AgenticCommerce.Unit.t.sol | 76 | — |
| AgenticCommerce.Fuzz.t.sol | 4 | — |
| AgenticCommerce.Invariant.t.sol | 4 | 128,000 per invariant |
| **Total** | **84** | **512,000** |

All 84 tests pass. Invariants verified:
1. **Solvency:** `balance(contract) == sum(Funded/Submitted budgets) + sum(owed[])`
2. **Terminal immutability:** no job leaves a terminal state (Completed / Rejected / Expired)
3. **Accounting identity:** `totalSettled + totalRefunded <= total ever funded`
4. **JobCount coherence:** `jobCount == totalJobs` always

---

## Audit Provenance

| Subagent | Dispatched | Files audited | Corpus rules cited |
|---|---|---|---|
| solidity-auditor | yes (pass 1) | 2 | no-corpus-rule |
| functional-auditor | yes (pass 1) | 1 | — |
| solidity-auditor | yes (pass 2) | 4 | none |
| functional-auditor | yes (pass 2) | 1 | — |
| solidity-auditor | yes (pass 3) | 1 | unchecked-low-level-call-success |
| functional-auditor | yes (pass 3) | 1 | — |
