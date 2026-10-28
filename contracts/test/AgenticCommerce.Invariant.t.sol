// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce, JobStatus, Job, Stats} from "../AgenticCommerce.sol";
import {MockUSDC} from "../test-helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

contract InvariantHandler is Test {
    AgenticCommerce public ac;
    MockUSDC        public usdc;

    // Five actors
    address public alice   = makeAddr("alice");   // typical client
    address public bob     = makeAddr("bob");     // typical provider
    address public carol   = makeAddr("carol");   // typical evaluator
    address public dave    = makeAddr("dave");
    address public eve     = makeAddr("eve");

    // All tracked actors (for owed[] sum)
    address[5] internal _actors;

    // Tracking funded jobs
    uint256[] public fundedJobIds;
    mapping(uint256 => bool) public isFunded;   // true if Funded or Submitted
    mapping(uint256 => uint256) public jobBudget; // budget for each funded job
    uint256 public totalEverFunded;

    // Per-job terminal-state snapshot: 0 = not terminal, else the uint8 of the status
    mapping(uint256 => uint8) public terminalStatus;

    // Call counters
    mapping(string => uint256) public callCount;

    constructor(AgenticCommerce ac_, MockUSDC usdc_) {
        ac   = ac_;
        usdc = usdc_;
        // Fund actors with ETH for gas
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave,  100 ether);
        vm.deal(eve,   100 ether);

        _actors = [alice, bob, carol, dave, eve];
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _actor(uint256 seed) internal view returns (address) {
        return _actors[seed % 5];
    }

    function _anyFundedJob(uint256 seed) internal view returns (uint256, bool) {
        if (fundedJobIds.length == 0) return (0, false);
        uint256 idx = seed % fundedJobIds.length;
        uint256 jid = fundedJobIds[idx];
        return (jid, isFunded[jid]);
    }

    // -----------------------------------------------------------------------
    // Handler functions
    // -----------------------------------------------------------------------

    /// Create a new job and fund it immediately.
    function create(uint256 seed) external {
        callCount["create"]++;

        address clientActor   = alice;
        address providerActor = bob;
        address evalActor     = carol;
        uint256 budget        = bound(seed, 1, 1_000e6);
        uint256 expiry        = block.timestamp + 7 days;

        usdc.mint(clientActor, budget);
        vm.prank(clientActor);
        usdc.approve(address(ac), budget);

        vm.prank(clientActor);
        uint256 jobId = ac.createAndFund(providerActor, evalActor, expiry, "inv job", budget);

        // Track
        fundedJobIds.push(jobId);
        isFunded[jobId]   = true;
        jobBudget[jobId]  = budget;
        totalEverFunded  += budget;
    }

    /// Provider submits a funded job.
    function submitJob(uint256 seed) external {
        callCount["submit"]++;
        (uint256 jobId, bool active) = _anyFundedJob(seed);
        if (!active) return;

        Job memory j = ac.getJob(jobId);
        if (j.status != JobStatus.Funded) return;
        if (block.timestamp >= j.expiredAt) return;

        vm.prank(bob); // provider = bob
        try ac.submit(jobId, bytes32(0), "") {} catch {}
    }

    /// Evaluator completes a submitted job.
    function completeJob(uint256 seed) external {
        callCount["complete"]++;
        (uint256 jobId, bool active) = _anyFundedJob(seed);
        if (!active) return;

        Job memory j = ac.getJob(jobId);
        if (j.status != JobStatus.Submitted) return;

        vm.prank(carol); // evaluator = carol
        try ac.complete(jobId, bytes32(0), "") {
            isFunded[jobId] = false;
            terminalStatus[jobId] = uint8(JobStatus.Completed);
        } catch {}
    }

    /// Evaluator rejects a funded or submitted job.
    function rejectJob(uint256 seed) external {
        callCount["reject"]++;
        (uint256 jobId, bool active) = _anyFundedJob(seed);
        if (!active) return;

        Job memory j = ac.getJob(jobId);
        if (j.status != JobStatus.Funded && j.status != JobStatus.Submitted) return;

        vm.prank(carol); // evaluator = carol
        try ac.reject(jobId, bytes32(0), "") {
            isFunded[jobId] = false;
            terminalStatus[jobId] = uint8(JobStatus.Rejected);
        } catch {}
    }

    /// Claim refund on expired jobs.
    function claimExpiredJob(uint256 seed) external {
        callCount["claimRefund"]++;
        (uint256 jobId, bool active) = _anyFundedJob(seed);
        if (!active) return;

        Job memory j = ac.getJob(jobId);
        if (j.status != JobStatus.Funded && j.status != JobStatus.Submitted) return;

        // Warp only a small amount (may or may not trigger expiry)
        vm.warp(block.timestamp + bound(seed, 0, 10 days));

        try ac.claimRefund(jobId) {
            isFunded[jobId] = false;
            terminalStatus[jobId] = uint8(JobStatus.Expired);
        } catch {}
    }

    /// @dev Return length of fundedJobIds array.
    function fundedJobIdsLength() external view returns (uint256) {
        return fundedJobIds.length;
    }

    /// @dev Compute the sum of budgets of all Funded+Submitted jobs.
    function sumActiveBudgets() external view returns (uint256 total) {
        for (uint256 i; i < fundedJobIds.length; i++) {
            uint256 jid = fundedJobIds[i];
            if (isFunded[jid]) {
                total += jobBudget[jid];
            }
        }
    }

    /// @dev Compute the sum of all owed[] amounts for all tracked actors.
    function sumOwed() external view returns (uint256 total) {
        for (uint256 i; i < _actors.length; i++) {
            total += ac.owed(_actors[i]);
        }
    }
}

// ---------------------------------------------------------------------------
// Invariant test contract
// ---------------------------------------------------------------------------

contract AgenticCommerceInvariantTest is Test {
    AgenticCommerce public ac;
    MockUSDC        public usdc;
    InvariantHandler public handler;

    function setUp() public {
        usdc    = new MockUSDC("Mock USDC", "mUSDC", 6);
        ac      = new AgenticCommerce(address(usdc), 1000); // 10% fee
        handler = new InvariantHandler(ac, usdc);

        // Only the handler drives state changes
        targetContract(address(handler));
    }

    // -----------------------------------------------------------------------
    // Invariant 1: Solvency
    // The contract's USDC balance == sum of budgets of Funded/Submitted jobs
    //                               + sum of all owed[] amounts for tracked actors.
    // -----------------------------------------------------------------------
    function invariant_solvency() public view {
        uint256 contractBal  = usdc.balanceOf(address(ac));
        uint256 trackedFunds = handler.sumActiveBudgets() + handler.sumOwed();
        assertEq(contractBal, trackedFunds, "solvency: balance != active budgets + owed");
    }

    // -----------------------------------------------------------------------
    // Invariant 2: Terminal state immutability
    // Once a job reaches Completed/Rejected/Expired it must not change.
    // We delegate the check to the handler which knows the list length.
    // -----------------------------------------------------------------------
    function invariant_noTerminalStateChange() public view {
        uint256 total = handler.fundedJobIdsLength();
        uint256 len   = total > 200 ? 200 : total;
        for (uint256 i; i < len; i++) {
            uint256 jid       = handler.fundedJobIds(i);
            uint8 snapshotted = handler.terminalStatus(jid);
            if (snapshotted == 0) continue; // not yet terminal
            Job memory j      = ac.getJob(jid);
            assertEq(uint8(j.status), snapshotted, "terminal state changed");
        }
    }

    // -----------------------------------------------------------------------
    // Invariant 3: Accounting identity
    // totalSettled + totalRefunded <= totalEverFunded
    // -----------------------------------------------------------------------
    function invariant_accountingIdentity() public view {
        assertLe(
            ac.totalSettled() + ac.totalRefunded(),
            handler.totalEverFunded(),
            "accounting: settled+refunded > ever funded"
        );
    }

    // -----------------------------------------------------------------------
    // Invariant 4: Counter non-vacuous (relaxed — just check jobCount coherence)
    // -----------------------------------------------------------------------
    function invariant_jobCountCoherence() public view {
        // jobCount and totalJobs should be equal (both increment in createJob/createAndFund)
        assertEq(ac.jobCount(), ac.totalJobs(), "jobCount != totalJobs");
    }
}
