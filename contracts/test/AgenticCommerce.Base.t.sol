// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce, JobStatus, Job, Stats, IACPHook,
        EvaluatorFeeTooHigh, NotClient, NotProvider, NotEvaluator,
        WrongStatus, Expired, NotExpired, HashMismatch,
        ZeroAddress, BudgetZero, TooLong,
        ExpiryInPast, ExpiryTooFar, NothingOwed} from "../AgenticCommerce.sol";
import {MockUSDC} from "../test-helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/// @dev A hook whose beforeAction and afterAction always revert.
///      Use this to test that hooks BLOCK non-safe calls (e.g. fund/submit/complete).
contract MaliciousHook is IACPHook {
    function beforeAction(bytes4, uint256, bytes calldata) external pure override {
        revert("MaliciousHook: before revert");
    }

    function afterAction(bytes4, uint256, bytes calldata) external pure override {
        revert("MaliciousHook: after revert");
    }
}

/// @dev A hook that reverts ONLY on the fund selector (lets setBudget/submit/etc pass through).
contract FundBlockHook is IACPHook {
    bytes4 private constant _FUND_SEL = bytes4(keccak256("fund(uint256,bytes)"));

    function beforeAction(bytes4 selector, uint256, bytes calldata) external pure override {
        if (selector == _FUND_SEL) revert("FundBlockHook: blocked fund");
    }

    function afterAction(bytes4, uint256, bytes calldata) external pure override {}
}

/// @dev A hook that reverts ONLY on reject and claimRefund selectors.
///      Fund/submit pass through, so we can get the job to Funded/Submitted,
///      then verify that reject/claimRefund succeed despite the hook reverting.
contract SelectiveRevertHook is IACPHook {
    // keccak256("reject(uint256,bytes32,bytes)") selector
    bytes4 private constant _REJECT_SEL      = bytes4(keccak256("reject(uint256,bytes32,bytes)"));
    bytes4 private constant _CLAIM_REFUND_SEL = bytes4(keccak256("claimRefund(uint256)"));

    function beforeAction(bytes4 selector, uint256, bytes calldata) external pure override {
        if (selector == _REJECT_SEL || selector == _CLAIM_REFUND_SEL) {
            revert("SelectiveRevertHook: revert on reject/claimRefund");
        }
    }

    function afterAction(bytes4 selector, uint256, bytes calldata) external pure override {
        if (selector == _REJECT_SEL || selector == _CLAIM_REFUND_SEL) {
            revert("SelectiveRevertHook: revert on reject/claimRefund");
        }
    }
}

/// @dev A hook whose afterAction tries to call reject again to test reentrancy.
contract ReentrantHook is IACPHook {
    AgenticCommerce public ac;
    uint256 public jobId;
    bool public triggered;

    constructor(AgenticCommerce ac_, uint256 jobId_) {
        ac = ac_;
        jobId = jobId_;
    }

    function beforeAction(bytes4, uint256, bytes calldata) external override {}

    function afterAction(bytes4, uint256, bytes calldata) external override {
        if (!triggered) {
            triggered = true;
            // attempt reentrant reject — should be blocked by ReentrancyGuard
            try ac.reject(jobId, bytes32(0), "") {} catch {}
        }
    }
}

/// @dev A hook whose beforeAction always reverts — used to test safe hooks on complete/submit.
contract AlwaysRevertHook is IACPHook {
    function beforeAction(bytes4, uint256, bytes calldata) external pure override {
        revert("AlwaysRevertHook: revert");
    }

    function afterAction(bytes4, uint256, bytes calldata) external pure override {
        revert("AlwaysRevertHook: revert");
    }
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

abstract contract AgenticCommerceTestBase is Test {
    // 10 % evaluator fee
    uint256 internal constant FEE_BPS = 1000;

    MockUSDC internal usdc;
    AgenticCommerce internal ac;

    address internal client   = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal evaluator = makeAddr("evaluator");
    address internal stranger  = makeAddr("stranger");

    // A future timestamp used as expiry by default — set dynamically in setUp
    // so it always satisfies: block.timestamp < expiry <= block.timestamp + 30 days.
    uint256 internal DEFAULT_EXPIRY;

    // -----------------------------------------------------------------------
    // setUp
    // -----------------------------------------------------------------------
    function setUp() public virtual {
        // block.timestamp starts at 1 in Foundry; use 7 days out (well within 30-day cap).
        DEFAULT_EXPIRY = block.timestamp + 7 days;

        usdc = new MockUSDC("Mock USDC", "mUSDC", 6);
        ac   = new AgenticCommerce(address(usdc), FEE_BPS);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Create a job from `client`, provider+evaluator pre-set, no hook.
    function _createJob() internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = ac.createJob(provider, evaluator, DEFAULT_EXPIRY, "test job", address(0));
    }

    /// Create + setBudget (still Open).
    function _createJobWithBudget(uint256 budget) internal returns (uint256 jobId) {
        jobId = _createJob();
        vm.prank(client);
        ac.setBudget(jobId, budget, "");
    }

    /// Create + setBudget + approve + fund (→ Funded).
    function _createAndFund(uint256 budget) internal returns (uint256 jobId) {
        jobId = _createJobWithBudget(budget);
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);
        vm.prank(client);
        ac.fund(jobId, "");
    }

    /// Create + setBudget + fund + submit (→ Submitted).
    function _createFundAndSubmit(uint256 budget) internal returns (uint256 jobId) {
        jobId = _createAndFund(budget);
        vm.prank(provider);
        ac.submit(jobId, keccak256(""), "");
    }

    /// Full happy-path: create → setBudget → fund → submit → complete.
    function _fullCycle(uint256 budget) internal returns (uint256 jobId) {
        jobId = _createFundAndSubmit(budget);
        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");
    }
}
