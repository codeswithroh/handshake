// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgenticCommerceTestBase} from "./AgenticCommerce.Base.t.sol";
import {AgenticCommerce, JobStatus} from "../AgenticCommerce.sol";

contract AgenticCommerceFuzzTest is AgenticCommerceTestBase {
    /// @notice Fuzz: for any budget in [1, 2^128) and feeBps in [0, 2000],
    ///         providerPayout + evaluatorFee == budget and contract holds 0.
    function testFuzz_FeeCalculation(uint256 budget, uint256 feeBps) public {
        feeBps = bound(feeBps, 0, 2000);
        budget = bound(budget, 1, type(uint128).max);

        // Deploy a fresh contract with the fuzzed feeBps
        AgenticCommerce ac2 = new AgenticCommerce(address(usdc), feeBps);

        vm.prank(client);
        uint256 jobId = ac2.createJob(provider, evaluator, DEFAULT_EXPIRY, "fuzz", address(0));
        vm.prank(client);
        ac2.setBudget(jobId, budget, "");

        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac2), budget);
        vm.prank(client);
        ac2.fund(jobId, "");

        vm.prank(provider);
        ac2.submit(jobId, keccak256(""), "");

        uint256 provBefore = usdc.balanceOf(provider);
        uint256 evalBefore = usdc.balanceOf(evaluator);

        vm.prank(evaluator);
        ac2.complete(jobId, bytes32(0), "");

        uint256 provGot  = usdc.balanceOf(provider)  - provBefore;
        uint256 evalGot  = usdc.balanceOf(evaluator) - evalBefore;

        // No dust: all funds disbursed
        assertEq(usdc.balanceOf(address(ac2)), 0, "contract balance zero");
        // Conservation: sum == budget
        assertEq(provGot + evalGot, budget, "payout + fee == budget");
        // Individual amounts match arithmetic
        uint256 expectedFee    = (budget * feeBps) / 10_000;
        uint256 expectedPayout = budget - expectedFee;
        assertEq(evalGot, expectedFee,    "evaluator fee correct");
        assertEq(provGot, expectedPayout, "provider payout correct");
    }

    /// @notice Fuzz: reject always refunds 100% of budget, no dust.
    function testFuzz_RejectFullRefund(uint256 budget) public {
        budget = bound(budget, 1, type(uint128).max);

        uint256 jobId = _createAndFund(budget);
        uint256 clientBefore = usdc.balanceOf(client);

        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(client),      clientBefore + budget, "full refund");
        assertEq(usdc.balanceOf(address(ac)), 0,                     "no dust");
        assertEq(ac.totalRefunded(),          budget,                "totalRefunded");
    }

    /// @notice Fuzz: claimRefund always refunds 100% of budget.
    ///         Expiry is bounded to [1 sec, 30 days] to satisfy the ExpiryTooFar check.
    function testFuzz_ClaimRefundFullRefund(uint256 budget, uint256 expiry) public {
        budget = bound(budget, 1, type(uint128).max);
        // Must satisfy: block.timestamp < expiry <= block.timestamp + 30 days
        expiry = bound(expiry, block.timestamp + 1, block.timestamp + 30 days);

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "f", address(0));
        vm.prank(client);
        ac.setBudget(jobId, budget, "");
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);
        vm.prank(client);
        ac.fund(jobId, "");

        vm.warp(expiry + 1);
        uint256 clientBefore = usdc.balanceOf(client);
        ac.claimRefund(jobId);

        assertEq(usdc.balanceOf(client),      clientBefore + budget, "full refund");
        assertEq(usdc.balanceOf(address(ac)), 0,                     "no dust");
    }

    /// @notice Fuzz: totalSettled only increments after complete().
    function testFuzz_TotalSettledAccumulates(uint256 budget1, uint256 budget2) public {
        budget1 = bound(budget1, 1, type(uint64).max);
        budget2 = bound(budget2, 1, type(uint64).max);

        _fullCycle(budget1);
        _fullCycle(budget2);

        assertEq(ac.totalSettled(), budget1 + budget2, "totalSettled accumulates");
        assertEq(ac.jobCount(),     2,                 "jobCount == 2");
    }
}
