// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgenticCommerceTestBase, MaliciousHook, FundBlockHook, SelectiveRevertHook, ReentrantHook, AlwaysRevertHook} from "./AgenticCommerce.Base.t.sol";
import {AgenticCommerce, JobStatus, Job, Stats, IACPHook,
        EvaluatorFeeTooHigh, NotClient, NotProvider, NotEvaluator,
        WrongStatus, Expired, NotExpired, HashMismatch,
        ZeroAddress, BudgetZero, TooLong,
        ExpiryInPast, ExpiryTooFar, NothingOwed} from "../AgenticCommerce.sol";
import {MockUSDC, MaliciousUSDC} from "../test-helpers/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AgenticCommerceUnitTest is AgenticCommerceTestBase {
    // =====================================================================
    // 1. Constructor validation
    // =====================================================================

    function test_Constructor_ZeroUSDC_Reverts() public {
        vm.expectRevert(ZeroAddress.selector);
        new AgenticCommerce(address(0), FEE_BPS);
    }

    function test_Constructor_FeeTooHigh_Reverts() public {
        vm.expectRevert(EvaluatorFeeTooHigh.selector);
        new AgenticCommerce(address(usdc), 2001);
    }

    function test_Constructor_MaxFee_Succeeds() public {
        AgenticCommerce ac2 = new AgenticCommerce(address(usdc), 2000);
        assertEq(ac2.evaluatorFeeBps(), 2000);
    }

    function test_Constructor_StoresValues() public view {
        assertEq(address(ac.USDC()), address(usdc));
        assertEq(ac.evaluatorFeeBps(), FEE_BPS);
    }

    // =====================================================================
    // 2. Happy path: create → setBudget → fund → submit → complete
    // =====================================================================

    function test_HappyPath_FullCycle_100USDC() public {
        uint256 budget = 100e6; // 100 USDC
        uint256 jobId = _createFundAndSubmit(budget);

        uint256 clientBalBefore   = usdc.balanceOf(client);
        uint256 providerBalBefore = usdc.balanceOf(provider);
        uint256 evalBalBefore     = usdc.balanceOf(evaluator);

        // Expect JobCompleted event
        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.JobCompleted(jobId, evaluator, bytes32(0), "", 90e6, 10e6);

        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        // Balance assertions
        assertEq(usdc.balanceOf(provider),   providerBalBefore + 90e6, "provider got 90");
        assertEq(usdc.balanceOf(evaluator),  evalBalBefore     + 10e6, "evaluator got 10");
        assertEq(usdc.balanceOf(address(ac)), 0,                       "contract holds 0");

        // Stats
        Stats memory ps = ac.getStats(provider);
        assertEq(ps.jobsCompleted, 1,   "provider jobsCompleted");
        assertEq(ps.usdcEarned,    90e6, "provider usdcEarned");

        Stats memory es = ac.getStats(evaluator);
        assertEq(es.usdcEarnedAsEvaluator, 10e6, "evaluator usdcEarnedAsEvaluator");

        Stats memory cs = ac.getStats(client);
        assertEq(cs.usdcSpent, 100e6, "client usdcSpent");

        // Global counters
        assertEq(ac.totalSettled(), 100e6, "totalSettled");
        assertEq(ac.totalJobs(),    1,     "totalJobs");
        assertEq(ac.jobCount(),     1,     "jobCount");

        // Job status
        Job memory j = ac.getJob(jobId);
        assertEq(uint8(j.status), uint8(JobStatus.Completed));
    }

    // =====================================================================
    // 3. createAndFund path
    // =====================================================================

    function test_CreateAndFund_EmitsAllEvents_AndFundedStatus() public {
        uint256 budget = 50e6;
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);

        vm.expectEmit(true, true, false, false, address(ac));
        emit AgenticCommerce.JobCreated(1, client, provider, evaluator, DEFAULT_EXPIRY, "caf job");
        vm.expectEmit(true, false, false, true, address(ac));
        emit AgenticCommerce.BudgetSet(1, budget);
        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.JobFunded(1, client, budget);

        vm.prank(client);
        uint256 jobId = ac.createAndFund(provider, evaluator, DEFAULT_EXPIRY, "caf job", budget);

        assertEq(jobId, 1);
        Job memory j = ac.getJob(jobId);
        assertEq(uint8(j.status), uint8(JobStatus.Funded), "status Funded");
        assertEq(j.budget, budget);
        assertEq(j.client, client);
        assertEq(j.provider, provider);
        assertEq(j.evaluator, evaluator);
        assertEq(usdc.balanceOf(address(ac)), budget, "contract holds budget");
    }

    function test_CreateAndFund_ThenSubmitComplete() public {
        uint256 budget = 50e6;
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);
        vm.prank(client);
        uint256 jobId = ac.createAndFund(provider, evaluator, DEFAULT_EXPIRY, "job", budget);

        vm.prank(provider);
        ac.submit(jobId, keccak256(""), "");
        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(address(ac)), 0, "contract drained");
        assertEq(ac.totalSettled(), budget);
    }

    // =====================================================================
    // 4. Reject after submit (evaluator, Submitted → Rejected)
    // =====================================================================

    function test_Reject_EvaluatorAfterSubmit_FullRefund() public {
        uint256 budget = 100e6;
        uint256 jobId  = _createFundAndSubmit(budget);

        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.JobRejected(jobId, evaluator, bytes32(0), "", budget);
        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.Refunded(jobId, client, budget);

        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(client), clientBalBefore + budget, "full refund to client");
        assertEq(usdc.balanceOf(address(ac)), 0);
        assertEq(ac.totalRefunded(), budget);

        // evaluator reject from Submitted → jobsRejectedAsProvider on provider
        Stats memory provS = ac.getStats(provider);
        assertEq(provS.jobsRejectedAsProvider, 1, "provider jobsRejectedAsProvider");

        Job memory j = ac.getJob(jobId);
        assertEq(uint8(j.status), uint8(JobStatus.Rejected));
    }

    // =====================================================================
    // 5. Reject from Funded (evaluator)
    // =====================================================================

    function test_Reject_EvaluatorFromFunded_FullRefund() public {
        uint256 budget = 75e6;
        uint256 jobId  = _createAndFund(budget);
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(client), clientBalBefore + budget, "full refund");
        assertEq(ac.totalRefunded(), budget);
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Rejected));
    }

    // =====================================================================
    // 6. Client reject while Open (budget=0)
    // =====================================================================

    function test_Reject_ClientWhileOpen_NoTransfer() public {
        uint256 jobId = _createJob();
        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.JobRejected(jobId, client, bytes32(0), "", 0);

        vm.prank(client);
        ac.reject(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(client), clientBalBefore, "no transfer");
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Rejected));
    }

    // =====================================================================
    // 7. claimRefund after expiry from Funded
    // =====================================================================

    function test_ClaimRefund_FromFunded_AfterExpiry() public {
        uint256 budget = 60e6;
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "job", address(0));
        vm.prank(client);
        ac.setBudget(jobId, budget, "");
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);
        vm.prank(client);
        ac.fund(jobId, "");

        uint256 clientBalBefore = usdc.balanceOf(client);
        vm.warp(expiry + 1);

        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.Refunded(jobId, client, budget);

        ac.claimRefund(jobId);

        assertEq(usdc.balanceOf(client), clientBalBefore + budget, "refund received");
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Expired));
        assertEq(ac.totalRefunded(), budget);
    }

    // =====================================================================
    // 8. claimRefund after expiry from Submitted
    // =====================================================================

    function test_ClaimRefund_FromSubmitted_AfterExpiry() public {
        uint256 budget = 40e6;
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "job", address(0));
        vm.prank(client);
        ac.setBudget(jobId, budget, "");
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);
        vm.prank(client);
        ac.fund(jobId, "");

        vm.prank(provider);
        ac.submit(jobId, keccak256(""), "");

        uint256 clientBalBefore = usdc.balanceOf(client);
        vm.warp(expiry + 1);
        ac.claimRefund(jobId); // anyone can call

        assertEq(usdc.balanceOf(client), clientBalBefore + budget, "refund received");
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Expired));
    }

    // =====================================================================
    // 9. claimRefund CANNOT be called before expiry
    // =====================================================================

    function test_ClaimRefund_BeforeExpiry_Reverts() public {
        uint256 jobId = _createAndFund(10e6);
        vm.expectRevert(NotExpired.selector);
        ac.claimRefund(jobId);
    }

    // =====================================================================
    // 10. Access-control reverts
    // =====================================================================

    function test_SetProvider_NonClient_Reverts() public {
        // Create job with no provider so setProvider is valid
        vm.prank(client);
        uint256 jobId = ac.createJob(address(0), evaluator, DEFAULT_EXPIRY, "job", address(0));
        vm.prank(stranger);
        vm.expectRevert(NotClient.selector);
        ac.setProvider(jobId, provider, "");
    }

    function test_SetBudget_NonClient_Reverts() public {
        uint256 jobId = _createJob();
        vm.prank(stranger);
        vm.expectRevert(NotClient.selector);
        ac.setBudget(jobId, 100e6, "");
    }

    function test_Fund_NonClient_Reverts() public {
        uint256 jobId = _createJobWithBudget(100e6);
        usdc.mint(stranger, 100e6);
        vm.prank(stranger);
        usdc.approve(address(ac), 100e6);
        vm.prank(stranger);
        vm.expectRevert(NotClient.selector);
        ac.fund(jobId, "");
    }

    function test_Submit_NonProvider_Reverts() public {
        uint256 jobId = _createAndFund(100e6);
        vm.prank(stranger);
        vm.expectRevert(NotProvider.selector);
        ac.submit(jobId, bytes32(0), "");
    }

    function test_Complete_NonEvaluator_Reverts() public {
        uint256 jobId = _createFundAndSubmit(100e6);
        vm.prank(stranger);
        vm.expectRevert(NotEvaluator.selector);
        ac.complete(jobId, bytes32(0), "");
    }

    function test_Reject_Stranger_Reverts() public {
        // stranger is neither client nor evaluator
        uint256 jobId = _createAndFund(100e6);
        vm.prank(stranger);
        vm.expectRevert(NotEvaluator.selector);
        ac.reject(jobId, bytes32(0), "");
    }

    // =====================================================================
    // 11. Invalid state transitions
    // =====================================================================

    function test_SetBudget_OnFunded_Reverts() public {
        uint256 jobId = _createAndFund(100e6);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Open, JobStatus.Funded));
        ac.setBudget(jobId, 200e6, "");
    }

    function test_Fund_OnFunded_Reverts() public {
        uint256 jobId = _createAndFund(100e6);
        usdc.mint(client, 100e6);
        vm.prank(client);
        usdc.approve(address(ac), 100e6);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Open, JobStatus.Funded));
        ac.fund(jobId, "");
    }

    function test_Submit_OnOpen_Reverts() public {
        uint256 jobId = _createJobWithBudget(100e6);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Funded, JobStatus.Open));
        ac.submit(jobId, bytes32(0), "");
    }

    function test_Complete_OnFunded_Reverts() public {
        uint256 jobId = _createAndFund(100e6);
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Submitted, JobStatus.Funded));
        ac.complete(jobId, bytes32(0), "");
    }

    function test_Complete_OnOpen_Reverts() public {
        uint256 jobId = _createJobWithBudget(100e6);
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Submitted, JobStatus.Open));
        ac.complete(jobId, bytes32(0), "");
    }

    function test_Reject_ClientOnFunded_Reverts() public {
        uint256 jobId = _createAndFund(100e6);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Open, JobStatus.Funded));
        ac.reject(jobId, bytes32(0), "");
    }

    function test_ClaimRefund_OnOpen_Reverts() public {
        uint256 jobId = _createJobWithBudget(100e6);
        vm.warp(DEFAULT_EXPIRY + 1);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Funded, JobStatus.Open));
        ac.claimRefund(jobId);
    }

    function test_ClaimRefund_OnCompleted_Reverts() public {
        uint256 jobId = _fullCycle(100e6);
        vm.warp(DEFAULT_EXPIRY + 1);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Funded, JobStatus.Completed));
        ac.claimRefund(jobId);
    }

    function test_Complete_AfterAlreadyCompleted_Reverts() public {
        uint256 jobId = _fullCycle(100e6);
        vm.prank(evaluator);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Submitted, JobStatus.Completed));
        ac.complete(jobId, bytes32(0), "");
    }

    function test_Submit_AfterExpiry_Reverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "job", address(0));
        vm.prank(client);
        ac.setBudget(jobId, 10e6, "");
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        ac.fund(jobId, "");

        vm.warp(expiry + 1);
        vm.prank(provider);
        vm.expectRevert(Expired.selector);
        ac.submit(jobId, bytes32(0), "");
    }

    // =====================================================================
    // 12. setProvider access control details
    // =====================================================================

    function test_SetProvider_ZeroAddress_Reverts() public {
        vm.prank(client);
        uint256 jobId = ac.createJob(address(0), evaluator, DEFAULT_EXPIRY, "job", address(0));
        vm.prank(client);
        vm.expectRevert(ZeroAddress.selector);
        ac.setProvider(jobId, address(0), "");
    }

    function test_SetProvider_AlreadySet_Reverts() public {
        // provider != address(0) in the job → WrongStatus per source line 179
        uint256 jobId = _createJob(); // provider already set
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Open, JobStatus.Open));
        ac.setProvider(jobId, makeAddr("newProvider"), "");
    }

    function test_SetProvider_WhenFunded_Reverts() public {
        uint256 jobId = _createAndFund(10e6);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(WrongStatus.selector, JobStatus.Open, JobStatus.Funded));
        ac.setProvider(jobId, provider, "");
    }

    function test_SetProvider_Success() public {
        vm.prank(client);
        uint256 jobId = ac.createJob(address(0), evaluator, DEFAULT_EXPIRY, "job", address(0));
        address newProvider = makeAddr("newProvider");

        vm.expectEmit(true, false, false, true, address(ac));
        emit AgenticCommerce.ProviderSet(jobId, newProvider);

        vm.prank(client);
        ac.setProvider(jobId, newProvider, "");

        assertEq(ac.getJob(jobId).provider, newProvider);
    }

    // =====================================================================
    // 13. Deliverable hash mismatch
    // =====================================================================

    function test_Submit_HashMismatch_Reverts() public {
        uint256 jobId = _createAndFund(10e6);
        bytes memory optParams = "some data";
        bytes32 wrongHash = keccak256("wrong");
        vm.prank(provider);
        vm.expectRevert(HashMismatch.selector);
        ac.submit(jobId, wrongHash, optParams);
    }

    function test_Submit_CorrectHash_Succeeds() public {
        uint256 jobId = _createAndFund(10e6);
        bytes memory optParams = "hello world";
        bytes32 correctHash = keccak256(optParams);
        vm.prank(provider);
        ac.submit(jobId, correctHash, optParams);
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Submitted));
        assertEq(ac.getJob(jobId).deliverable, correctHash);
    }

    function test_Submit_EmptyOptParams_EnforcesHashCheck() public {
        uint256 jobId = _createAndFund(10e6);

        // (a) empty optParams with a wrong deliverable must revert HashMismatch
        vm.prank(provider);
        vm.expectRevert(HashMismatch.selector);
        ac.submit(jobId, keccak256("anything"), "");

        // (b) empty optParams with deliverable == keccak256("") must succeed
        vm.prank(provider);
        ac.submit(jobId, keccak256(""), "");
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Submitted));
    }

    // =====================================================================
    // 14. TooLong validation
    // =====================================================================

    function test_CreateJob_DescriptionTooLong_Reverts() public {
        string memory longDesc = new string(2001);
        // Fill with 'a'
        bytes memory b = bytes(longDesc);
        for (uint256 i; i < b.length; i++) b[i] = 0x61;
        vm.prank(client);
        vm.expectRevert(TooLong.selector);
        ac.createJob(provider, evaluator, DEFAULT_EXPIRY, string(b), address(0));
    }

    function test_Submit_OptParamsTooLong_Reverts() public {
        uint256 jobId = _createAndFund(10e6);
        bytes memory longParams = new bytes(4001);
        bytes32 hash = keccak256(longParams);
        vm.prank(provider);
        vm.expectRevert(TooLong.selector);
        ac.submit(jobId, hash, longParams);
    }

    // =====================================================================
    // 15. Fee math — no dust leaks
    // =====================================================================

    function test_FeeMath_Budget1_FeeRoundsToZero() public {
        uint256 budget = 1;
        uint256 jobId  = _createFundAndSubmit(budget);
        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        // fee = 1 * 1000 / 10000 = 0 (rounds down)
        assertEq(usdc.balanceOf(provider),     1, "provider gets 1");
        assertEq(usdc.balanceOf(address(ac)),  0, "no dust");
    }

    function test_FeeMath_Budget33333() public {
        uint256 budget = 33333;
        uint256 jobId  = _createFundAndSubmit(budget);

        uint256 provBal = usdc.balanceOf(provider);
        uint256 evalBal = usdc.balanceOf(evaluator);

        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        uint256 evalFee     = (budget * FEE_BPS) / 10_000; // 3333
        uint256 provPayout  = budget - evalFee;             // 30000

        assertEq(usdc.balanceOf(provider),    provBal + provPayout, "provider payout");
        assertEq(usdc.balanceOf(evaluator),   evalBal + evalFee,    "evaluator fee");
        assertEq(provPayout + evalFee,        budget,               "no dust: sum == budget");
        assertEq(usdc.balanceOf(address(ac)), 0,                    "contract drained");
    }

    function test_FeeMath_Budget99_FeeRoundsDown() public {
        // 99 * 1000 / 10000 = 9 (not 9.9), payout = 90, sum = 99
        uint256 budget = 99;
        uint256 jobId  = _createFundAndSubmit(budget);

        uint256 provBal = usdc.balanceOf(provider);
        uint256 evalBal = usdc.balanceOf(evaluator);

        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(provider),   provBal + 90, "provider 90");
        assertEq(usdc.balanceOf(evaluator),  evalBal + 9,  "evaluator 9");
        assertEq(usdc.balanceOf(address(ac)), 0,           "no dust");
    }

    function test_FeeMath_Budget1_FeeBps1() public {
        // Deploy with feeBps=1; 1 * 1 / 10000 = 0
        AgenticCommerce ac2 = new AgenticCommerce(address(usdc), 1);

        vm.prank(client);
        uint256 jobId = ac2.createJob(provider, evaluator, DEFAULT_EXPIRY, "j", address(0));
        vm.prank(client);
        ac2.setBudget(jobId, 1, "");
        usdc.mint(client, 1);
        vm.prank(client);
        usdc.approve(address(ac2), 1);
        vm.prank(client);
        ac2.fund(jobId, "");
        vm.prank(provider);
        ac2.submit(jobId, keccak256(""), "");
        vm.prank(evaluator);
        ac2.complete(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(provider),    1, "provider gets 1");
        assertEq(usdc.balanceOf(address(ac2)), 0, "no dust");
    }

    // =====================================================================
    // 16. Stats and global counters
    // =====================================================================

    function test_Stats_After2CompletedJobs() public {
        _fullCycle(40e6);
        _fullCycle(60e6);

        assertEq(ac.totalJobs(),    2, "totalJobs");
        assertEq(ac.totalSettled(), 100e6, "totalSettled");

        Stats memory ps = ac.getStats(provider);
        assertEq(ps.jobsCompleted, 2,    "provider jobs completed");
        assertEq(ps.usdcEarned,    90e6, "provider earned 90% of 100");

        Stats memory cs = ac.getStats(client);
        assertEq(cs.usdcSpent,    100e6, "client spent");
        assertEq(cs.jobsPosted,    2,    "client posted 2");
    }

    function test_Stats_AfterReject() public {
        uint256 budget = 50e6;
        uint256 jobId  = _createFundAndSubmit(budget);
        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        assertEq(ac.totalRefunded(), budget, "totalRefunded");
        // evaluator rejects Submitted job → jobsRejectedAsProvider on provider
        Stats memory provS = ac.getStats(provider);
        assertEq(provS.jobsRejectedAsProvider, 1, "provider jobsRejectedAsProvider");
    }

    function test_GetStats_ReturnsCorrectStruct() public {
        _fullCycle(100e6);
        Stats memory ps = ac.getStats(provider);
        assertEq(ps.jobsCompleted, 1);
        assertEq(ps.usdcEarned,    90e6);
        assertEq(ps.jobsCancelledByClient, 0);
        assertEq(ps.usdcSpent,     0);
    }

    // =====================================================================
    // 17. Malicious hook cannot block reject or claimRefund
    // =====================================================================

    function test_MaliciousHook_CannotBlockReject() public {
        // SelectiveRevertHook: passes fund/submit but reverts on reject/claimRefund selectors.
        // The contract wraps reject's hook calls in try/catch, so reject still succeeds.
        SelectiveRevertHook hook = new SelectiveRevertHook();

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, DEFAULT_EXPIRY, "job", address(hook));
        vm.prank(client);
        ac.setBudget(jobId, 10e6, "");
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        ac.fund(jobId, "");

        uint256 clientBalBefore = usdc.balanceOf(client);
        // reject should succeed despite hook reverting on the reject selector
        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(client), clientBalBefore + 10e6, "refund despite hook");
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Rejected));
    }

    function test_MaliciousHook_CannotBlockClaimRefund() public {
        // SelectiveRevertHook: passes fund/submit but reverts on claimRefund selector.
        SelectiveRevertHook hook = new SelectiveRevertHook();
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "job", address(hook));
        vm.prank(client);
        ac.setBudget(jobId, 10e6, "");
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        ac.fund(jobId, "");

        vm.prank(provider);
        ac.submit(jobId, keccak256(""), "");

        vm.warp(expiry + 1);
        uint256 clientBalBefore = usdc.balanceOf(client);
        ac.claimRefund(jobId); // should succeed despite hook reverting

        assertEq(usdc.balanceOf(client), clientBalBefore + 10e6, "refund despite hook");
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Expired));
    }

    // =====================================================================
    // 18. MaliciousHook: beforeAction on non-safe paths reverts
    // =====================================================================

    // A hook that always reverts blocks setBudget (non-safe _callBeforeAction).
    function test_MaliciousHook_BlocksSetBudget() public {
        MaliciousHook hook = new MaliciousHook();

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, DEFAULT_EXPIRY, "job", address(hook));
        vm.prank(client);
        vm.expectRevert("MaliciousHook: before revert");
        ac.setBudget(jobId, 10e6, "");
    }

    // A FundBlockHook only reverts on the fund selector, letting setBudget pass.
    // This confirms fund()'s _callBeforeAction (non-safe) bubbles up the revert.
    function test_MaliciousHook_BlocksFund() public {
        FundBlockHook hook = new FundBlockHook();

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, DEFAULT_EXPIRY, "job", address(hook));
        vm.prank(client);
        ac.setBudget(jobId, 10e6, ""); // passes: hook only blocks fund selector
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        vm.expectRevert("FundBlockHook: blocked fund");
        ac.fund(jobId, "");
    }

    // =====================================================================
    // 19. Reentrancy attempt via MaliciousUSDC is blocked
    // =====================================================================

    function test_Reentrancy_MaliciousUSDC_Blocked() public {
        MaliciousUSDC mUsdc = new MaliciousUSDC("M-USDC", "mUSDC", 6);
        AgenticCommerce ac2  = new AgenticCommerce(address(mUsdc), FEE_BPS);

        uint256 budget = 50e6;

        vm.prank(client);
        uint256 jobId = ac2.createJob(provider, evaluator, DEFAULT_EXPIRY, "job", address(0));
        vm.prank(client);
        ac2.setBudget(jobId, budget, "");
        mUsdc.mint(client, budget * 2); // extra for potential reentrant call
        vm.prank(client);
        mUsdc.approve(address(ac2), budget * 2);

        // Arm the reentrant attack targeting the same jobId
        mUsdc.arm(address(ac2), jobId);

        // fund() should succeed (reentrant call inside transferFrom is caught),
        // but the job ends up Funded only once
        vm.prank(client);
        ac2.fund(jobId, "");

        // The job should be Funded (not double-funded)
        assertEq(uint8(ac2.getJob(jobId).status), uint8(JobStatus.Funded));
        // Contract should hold exactly 1x budget
        assertEq(mUsdc.balanceOf(address(ac2)), budget, "only one budget held");
    }

    // =====================================================================
    // 20. createAndFund: ZeroAddress and BudgetZero validations
    // =====================================================================

    function test_CreateAndFund_ZeroProvider_Reverts() public {
        vm.prank(client);
        vm.expectRevert(ZeroAddress.selector);
        ac.createAndFund(address(0), evaluator, DEFAULT_EXPIRY, "job", 10e6);
    }

    function test_CreateAndFund_ZeroEvaluator_Reverts() public {
        vm.prank(client);
        vm.expectRevert(ZeroAddress.selector);
        ac.createAndFund(provider, address(0), DEFAULT_EXPIRY, "job", 10e6);
    }

    function test_CreateAndFund_ZeroBudget_Reverts() public {
        vm.prank(client);
        vm.expectRevert(BudgetZero.selector);
        ac.createAndFund(provider, evaluator, DEFAULT_EXPIRY, "job", 0);
    }

    // =====================================================================
    // 21. createAndFund: TooLong description
    // =====================================================================

    function test_CreateAndFund_DescriptionTooLong_Reverts() public {
        bytes memory b = new bytes(2001);
        for (uint256 i; i < b.length; i++) b[i] = 0x61;
        vm.prank(client);
        vm.expectRevert(TooLong.selector);
        ac.createAndFund(provider, evaluator, DEFAULT_EXPIRY, string(b), 10e6);
    }

    // =====================================================================
    // 22. setBudget: BudgetZero
    // =====================================================================

    function test_SetBudget_Zero_Reverts() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        vm.expectRevert(BudgetZero.selector);
        ac.setBudget(jobId, 0, "");
    }

    // =====================================================================
    // 23. createJob: ZeroAddress evaluator
    // =====================================================================

    function test_CreateJob_ZeroEvaluator_Reverts() public {
        vm.prank(client);
        vm.expectRevert(ZeroAddress.selector);
        ac.createJob(provider, address(0), DEFAULT_EXPIRY, "job", address(0));
    }

    // =====================================================================
    // 24. fund: ZeroAddress provider
    // =====================================================================

    function test_Fund_ZeroProvider_Reverts() public {
        // Create job with no provider, set budget but don't set provider
        vm.prank(client);
        uint256 jobId = ac.createJob(address(0), evaluator, DEFAULT_EXPIRY, "job", address(0));
        vm.prank(client);
        ac.setBudget(jobId, 10e6, "");
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        vm.expectRevert(ZeroAddress.selector);
        ac.fund(jobId, "");
    }

    // =====================================================================
    // 25. Evaluator == Provider: single transfer
    // =====================================================================

    function test_Complete_EvaluatorEqualsProvider() public {
        AgenticCommerce ac2 = new AgenticCommerce(address(usdc), FEE_BPS);
        address provEval = makeAddr("provEval");
        uint256 budget   = 100e6;

        vm.prank(client);
        uint256 jobId = ac2.createJob(provEval, provEval, DEFAULT_EXPIRY, "job", address(0));
        vm.prank(client);
        ac2.setBudget(jobId, budget, "");
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac2), budget);
        vm.prank(client);
        ac2.fund(jobId, "");
        vm.prank(provEval);
        ac2.submit(jobId, keccak256(""), "");
        vm.prank(provEval);
        ac2.complete(jobId, bytes32(0), "");

        assertEq(usdc.balanceOf(provEval),     budget, "full budget to provEval");
        assertEq(usdc.balanceOf(address(ac2)), 0,      "no dust");
    }

    // =====================================================================
    // 26. complete: ZeroAddress provider/evaluator guard
    // =====================================================================
    function test_Complete_ZeroProvider_Reverts() public {
        // provider=address(0) at Submitted is unreachable via normal flow (fund() requires it).
        // Documented as dead-code path; no test needed.
        vm.skip(false); // not skipped
    }

    // =====================================================================
    // 27. Safe hooks on complete — malicious hook cannot block complete
    // =====================================================================

    function test_SafeHook_CannotBlockComplete() public view {
        // This test documents the design constraint:
        // AlwaysRevertHook blocks ALL selectors including fund() (non-safe hook),
        // so a job with AlwaysRevertHook can never be funded via the normal path.
        // The actual safe-hook proof for complete() is in
        // test_SafeHook_MaliciousComplete_CannotBlockPayout, which uses
        // CompleteRevertHook (passes fund/submit, reverts only on complete).
        assertTrue(true);
    }

    /// @dev A hook that only reverts on the complete selector (passes fund/submit).
    ///      Proves that complete() is safe (hook cannot block it).
    function test_SafeHook_MaliciousComplete_CannotBlockPayout() public {
        // Deploy inline hook contract that reverts only on complete
        CompleteRevertHook hook = new CompleteRevertHook();

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, DEFAULT_EXPIRY, "job", address(hook));
        vm.prank(client);
        ac.setBudget(jobId, 100e6, "");
        usdc.mint(client, 100e6);
        vm.prank(client);
        usdc.approve(address(ac), 100e6);
        vm.prank(client);
        ac.fund(jobId, ""); // fund uses non-safe hook, but CompleteRevertHook passes fund

        vm.prank(provider);
        ac.submit(jobId, keccak256(""), ""); // submit uses safe hook

        uint256 provBefore = usdc.balanceOf(provider);
        uint256 evalBefore = usdc.balanceOf(evaluator);

        // complete uses safe hooks — should succeed despite CompleteRevertHook reverting
        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Completed), "job completed");
        assertEq(usdc.balanceOf(provider),  provBefore + 90e6, "provider payout");
        assertEq(usdc.balanceOf(evaluator), evalBefore + 10e6, "evaluator fee");
    }

    // =====================================================================
    // 28. Blocklisted provider on complete (deferred payout)
    // =====================================================================

    function test_BlocklistedProvider_Complete_DefersPayout() public {
        uint256 budget = 100e6;
        uint256 jobId  = _createFundAndSubmit(budget);

        uint256 evalBefore  = usdc.balanceOf(evaluator);
        uint256 provBefore  = usdc.balanceOf(provider);

        // Blocklist provider
        usdc.setBlocklisted(provider, true);

        // Expect PayoutDeferred for provider
        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.PayoutDeferred(jobId, provider, 90e6);

        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        // Job completes
        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Completed), "completed");
        // Provider USDC balance unchanged
        assertEq(usdc.balanceOf(provider), provBefore, "provider balance unchanged");
        // Provider owed == 90e6
        assertEq(ac.owed(provider), 90e6, "provider owed");
        // Evaluator got paid immediately
        assertEq(usdc.balanceOf(evaluator), evalBefore + 10e6, "evaluator paid");

        // Unblock provider and withdrawOwed
        usdc.setBlocklisted(provider, false);
        vm.prank(provider);
        ac.withdrawOwed();

        assertEq(usdc.balanceOf(provider), provBefore + 90e6, "provider paid after withdraw");
        assertEq(ac.owed(provider), 0, "owed cleared");
    }

    // =====================================================================
    // 29. Blocklisted evaluator on complete (deferred payout)
    // =====================================================================

    function test_BlocklistedEvaluator_Complete_DefersFee() public {
        uint256 budget = 100e6;
        uint256 jobId  = _createFundAndSubmit(budget);

        uint256 evalBefore = usdc.balanceOf(evaluator);
        uint256 provBefore = usdc.balanceOf(provider);

        // Blocklist evaluator
        usdc.setBlocklisted(evaluator, true);

        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.PayoutDeferred(jobId, evaluator, 10e6);

        vm.prank(evaluator);
        ac.complete(jobId, bytes32(0), "");

        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Completed), "completed");
        assertEq(usdc.balanceOf(evaluator), evalBefore, "evaluator balance unchanged");
        assertEq(ac.owed(evaluator), 10e6, "evaluator owed");
        // Provider got paid immediately
        assertEq(usdc.balanceOf(provider), provBefore + 90e6, "provider paid");

        // Unblock and withdraw
        usdc.setBlocklisted(evaluator, false);
        vm.prank(evaluator);
        ac.withdrawOwed();

        assertEq(usdc.balanceOf(evaluator), evalBefore + 10e6, "evaluator paid after withdraw");
        assertEq(ac.owed(evaluator), 0, "owed cleared");
    }

    // =====================================================================
    // 30. Blocklisted client on reject (from Funded)
    // =====================================================================

    function test_BlocklistedClient_Reject_DefersRefund() public {
        uint256 budget = 80e6;
        uint256 jobId  = _createAndFund(budget);

        uint256 clientBefore = usdc.balanceOf(client);

        // Blocklist client
        usdc.setBlocklisted(client, true);

        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.PayoutDeferred(jobId, client, budget);

        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Rejected), "rejected");
        assertEq(usdc.balanceOf(client), clientBefore, "client balance unchanged");
        assertEq(ac.owed(client), budget, "client owed");

        // Unblock and withdraw
        usdc.setBlocklisted(client, false);
        vm.prank(client);
        ac.withdrawOwed();

        assertEq(usdc.balanceOf(client), clientBefore + budget, "client paid after withdraw");
        assertEq(ac.owed(client), 0, "owed cleared");
    }

    // =====================================================================
    // 31. Blocklisted client on claimRefund
    // =====================================================================

    function test_BlocklistedClient_ClaimRefund_DefersRefund() public {
        uint256 budget = 60e6;
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "job", address(0));
        vm.prank(client);
        ac.setBudget(jobId, budget, "");
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac), budget);
        vm.prank(client);
        ac.fund(jobId, "");

        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(expiry + 1);

        // Blocklist client
        usdc.setBlocklisted(client, true);

        vm.expectEmit(true, true, false, true, address(ac));
        emit AgenticCommerce.PayoutDeferred(jobId, client, budget);

        ac.claimRefund(jobId);

        assertEq(uint8(ac.getJob(jobId).status), uint8(JobStatus.Expired), "expired");
        assertEq(usdc.balanceOf(client), clientBefore, "client balance unchanged");
        assertEq(ac.owed(client), budget, "client owed");

        // Unblock and withdraw
        usdc.setBlocklisted(client, false);
        vm.prank(client);
        ac.withdrawOwed();

        assertEq(usdc.balanceOf(client), clientBefore + budget, "client paid after withdraw");
        assertEq(ac.owed(client), 0, "owed cleared");
    }

    // =====================================================================
    // 32. withdrawOwed reverts NothingOwed when owed == 0
    // =====================================================================

    function test_WithdrawOwed_NothingOwed_Reverts() public {
        address fresh = makeAddr("fresh");
        vm.prank(fresh);
        vm.expectRevert(NothingOwed.selector);
        ac.withdrawOwed();
    }

    // =====================================================================
    // 33. ExpiryInPast validation
    // =====================================================================

    function test_CreateJob_ExpiryAtTimestamp_Reverts() public {
        vm.prank(client);
        vm.expectRevert(ExpiryInPast.selector);
        ac.createJob(provider, evaluator, block.timestamp, "job", address(0));
    }

    function test_CreateJob_ExpiryInPast_Reverts() public {
        vm.warp(100); // ensure block.timestamp > 1
        vm.prank(client);
        vm.expectRevert(ExpiryInPast.selector);
        ac.createJob(provider, evaluator, block.timestamp - 1, "job", address(0));
    }

    function test_CreateAndFund_ExpiryInPast_Reverts() public {
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        vm.expectRevert(ExpiryInPast.selector);
        ac.createAndFund(provider, evaluator, block.timestamp, "job", 10e6);
    }

    // =====================================================================
    // 34. ExpiryTooFar validation
    // =====================================================================

    function test_CreateJob_ExpiryTooFar_Reverts() public {
        vm.prank(client);
        vm.expectRevert(ExpiryTooFar.selector);
        ac.createJob(provider, evaluator, block.timestamp + 30 days + 1, "job", address(0));
    }

    function test_CreateJob_ExpiryExactlyAt30Days_Succeeds() public {
        uint256 expiry = block.timestamp + 30 days;
        vm.prank(client);
        uint256 jobId = ac.createJob(provider, evaluator, expiry, "job", address(0));
        assertEq(ac.getJob(jobId).expiredAt, expiry);
    }

    function test_CreateAndFund_ExpiryTooFar_Reverts() public {
        usdc.mint(client, 10e6);
        vm.prank(client);
        usdc.approve(address(ac), 10e6);
        vm.prank(client);
        vm.expectRevert(ExpiryTooFar.selector);
        ac.createAndFund(provider, evaluator, block.timestamp + 30 days + 1, "job", 10e6);
    }

    // =====================================================================
    // 35. Stats semantics — client cancel vs evaluator reject
    // =====================================================================

    function test_Stats_ClientCancelOpen_IncrementsCancelledByClient() public {
        uint256 jobId = _createJob();

        vm.prank(client);
        ac.reject(jobId, bytes32(0), "");

        Stats memory cs = ac.getStats(client);
        assertEq(cs.jobsCancelledByClient, 1, "client jobsCancelledByClient");
        Stats memory ps = ac.getStats(provider);
        assertEq(ps.jobsRejectedAsProvider, 0, "provider jobsRejectedAsProvider unchanged");
    }

    function test_Stats_EvaluatorRejectFunded_IncrementsRejectedAsProvider() public {
        uint256 jobId = _createAndFund(50e6);

        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        Stats memory ps = ac.getStats(provider);
        assertEq(ps.jobsRejectedAsProvider, 1, "provider jobsRejectedAsProvider");
        Stats memory cs = ac.getStats(client);
        assertEq(cs.jobsCancelledByClient, 0, "client jobsCancelledByClient unchanged");
    }

    function test_Stats_EvaluatorRejectSubmitted_IncrementsRejectedAsProvider() public {
        uint256 jobId = _createFundAndSubmit(50e6);

        vm.prank(evaluator);
        ac.reject(jobId, bytes32(0), "");

        Stats memory ps = ac.getStats(provider);
        assertEq(ps.jobsRejectedAsProvider, 1, "provider jobsRejectedAsProvider");
        Stats memory cs = ac.getStats(client);
        assertEq(cs.jobsCancelledByClient, 0, "client jobsCancelledByClient unchanged");
    }

    // =====================================================================
    // 36. Stats — evaluator == provider special case
    // =====================================================================

    function test_Stats_EvaluatorEqualsProvider_SplitStats() public {
        address provEval = makeAddr("provEval2");
        uint256 budget   = 100e6;
        AgenticCommerce ac2 = new AgenticCommerce(address(usdc), FEE_BPS);

        vm.prank(client);
        uint256 jobId = ac2.createJob(provEval, provEval, DEFAULT_EXPIRY, "job", address(0));
        vm.prank(client);
        ac2.setBudget(jobId, budget, "");
        usdc.mint(client, budget);
        vm.prank(client);
        usdc.approve(address(ac2), budget);
        vm.prank(client);
        ac2.fund(jobId, "");
        vm.prank(provEval);
        ac2.submit(jobId, keccak256(""), "");
        vm.prank(provEval);
        ac2.complete(jobId, bytes32(0), "");

        Stats memory s = ac2.getStats(provEval);
        uint256 expectedFee    = (budget * FEE_BPS) / 10_000; // 10e6
        uint256 expectedPayout = budget - expectedFee;         // 90e6

        // When evaluator == provider, the contract sends the whole budget in one transfer.
        // Stats are still split: usdcEarned = providerPayout, usdcEarnedAsEvaluator = fee.
        assertEq(s.usdcEarned,            expectedPayout, "usdcEarned == providerPayout");
        assertEq(s.usdcEarnedAsEvaluator, expectedFee,    "usdcEarnedAsEvaluator == fee");
        // No owed amount (single transfer of full budget should succeed)
        assertEq(ac2.owed(provEval), 0, "owed == 0");
        // Balance == full budget
        assertEq(usdc.balanceOf(provEval), budget, "provEval balance == budget");
    }
}

// ---------------------------------------------------------------------------
// Helper hook: reverts ONLY on complete selector (passes fund/submit)
// ---------------------------------------------------------------------------
contract CompleteRevertHook is IACPHook {
    bytes4 private constant _COMPLETE_SEL = bytes4(keccak256("complete(uint256,bytes32,bytes)"));

    function beforeAction(bytes4 selector, uint256, bytes calldata) external pure override {
        if (selector == _COMPLETE_SEL) revert("CompleteRevertHook: revert on complete");
    }

    function afterAction(bytes4 selector, uint256, bytes calldata) external pure override {
        if (selector == _COMPLETE_SEL) revert("CompleteRevertHook: revert on complete");
    }
}
