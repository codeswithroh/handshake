// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

error NotClient();
error NotProvider();
error NotEvaluator();
error WrongStatus(JobStatus expected, JobStatus actual);
error Expired();
error NotExpired();
error HashMismatch();
error ZeroAddress();
error BudgetZero();
error TooLong();
error EvaluatorFeeTooHigh();
error ExpiryInPast();
error ExpiryTooFar();
error NothingOwed();

enum JobStatus {
    Open,
    Funded,
    Submitted,
    Completed,
    Rejected,
    Expired
}

struct Job {
    uint256 id;
    address client;
    address provider;
    address evaluator;
    string description;
    uint256 budget;
    uint256 expiredAt;
    JobStatus status;
    address hook;
    bytes32 deliverable;
    uint256 createdAt;
}

struct Stats {
    uint256 jobsCompleted;
    uint256 jobsCancelledByClient;
    uint256 jobsRejectedAsProvider;
    uint256 usdcEarned;
    uint256 usdcEarnedAsEvaluator;
    uint256 jobsPosted;
    uint256 usdcSpent;
}

interface IACPHook {
    function beforeAction(bytes4 selector, uint256 jobId, bytes calldata data) external;

    function afterAction(bytes4 selector, uint256 jobId, bytes calldata data) external;
}

interface IAgenticCommerce {
    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description, address hook)
        external
        returns (uint256 jobId);

    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external;

    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external;

    function fund(uint256 jobId, bytes calldata optParams) external;

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external;

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function claimRefund(uint256 jobId) external;

    function withdrawOwed() external;

    function getJob(uint256 jobId) external view returns (Job memory);

    function getStats(address account) external view returns (Stats memory);

    function createAndFund(address provider, address evaluator, uint256 expiredAt, string calldata description, uint256 budget)
        external
        returns (uint256 jobId);

    function owed(address account) external view returns (uint256);

    function jobCount() external view returns (uint256);
}

/**
 * @title AgenticCommerce
 * @notice ERC-8183 Agentic Commerce job escrow. Clients lock USDC; providers submit work;
 *         evaluators release or refund the escrow. Compatible with the Arc Testnet reference
 *         deployment at 0x0747EEf0706327138c69792bF28Cd525089e4583.
 *
 * @dev Payout model: funds are transferred directly to recipients. If a transfer fails (e.g.,
 *      USDC blocklist), the amount is credited to owed[recipient] instead and a PayoutDeferred
 *      event is emitted. Recipients call withdrawOwed() to claim deferred amounts. Jobs always
 *      reach their terminal state regardless of individual transfer outcomes.
 */
contract AgenticCommerce is IAgenticCommerce, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        string description
    );
    event ProviderSet(uint256 indexed jobId, address provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable, bytes optParams);
    event JobCompleted(
        uint256 indexed jobId,
        address indexed evaluator,
        bytes32 reason,
        bytes optParams,
        uint256 providerPayout,
        uint256 evaluatorFee
    );
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason, bytes optParams, uint256 refund);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event PayoutDeferred(uint256 indexed jobId, address indexed recipient, uint256 amount);

    IERC20 public immutable USDC;
    uint256 public immutable evaluatorFeeBps;

    mapping(uint256 => Job) private _jobs;
    uint256 public jobCount;
    uint256 public totalSettled;
    uint256 public totalRefunded;
    uint256 public totalJobs;
    mapping(address => Stats) private _stats;
    mapping(address => uint256) public owed;

    uint256 private constant _MAX_DESCRIPTION_LENGTH = 2000;
    uint256 private constant _MAX_OPT_PARAMS_LENGTH = 4000;
    uint256 private constant _MAX_JOB_DURATION = 30 days;

    bytes4 private constant _SET_PROVIDER_SELECTOR = bytes4(keccak256("setProvider(uint256,address,bytes)"));
    bytes4 private constant _SET_BUDGET_SELECTOR = bytes4(keccak256("setBudget(uint256,uint256,bytes)"));
    bytes4 private constant _FUND_SELECTOR = bytes4(keccak256("fund(uint256,bytes)"));
    bytes4 private constant _SUBMIT_SELECTOR = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
    bytes4 private constant _COMPLETE_SELECTOR = bytes4(keccak256("complete(uint256,bytes32,bytes)"));
    bytes4 private constant _REJECT_SELECTOR = bytes4(keccak256("reject(uint256,bytes32,bytes)"));
    bytes4 private constant _CLAIM_REFUND_SELECTOR = bytes4(keccak256("claimRefund(uint256)"));
    // _WITHDRAW_OWED_SELECTOR is reserved for future hook integrations.
    // solhint-disable-next-line private-vars-leading-underscore
    bytes4 internal constant WITHDRAW_OWED_SELECTOR = bytes4(keccak256("withdrawOwed()"));

    constructor(address usdc_, uint256 evaluatorFeeBps_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (evaluatorFeeBps_ > 2000) revert EvaluatorFeeTooHigh();

        USDC = IERC20(usdc_);
        evaluatorFeeBps = evaluatorFeeBps_;
    }

    // ===== ERC-8183 STANDARD =====

    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description, address hook)
        external
        returns (uint256 jobId)
    {
        if (evaluator == address(0)) revert ZeroAddress();
        if (bytes(description).length > _MAX_DESCRIPTION_LENGTH) revert TooLong();
        if (expiredAt <= block.timestamp) revert ExpiryInPast();
        if (expiredAt > block.timestamp + _MAX_JOB_DURATION) revert ExpiryTooFar();

        jobId = ++jobCount;
        ++totalJobs;

        _jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: JobStatus.Open,
            hook: hook,
            deliverable: bytes32(0),
            createdAt: block.timestamp
        });

        _stats[msg.sender].jobsPosted++;

        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, description);
    }

    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external {
        Job storage job = _jobs[jobId];

        if (msg.sender != job.client) revert NotClient();
        if (job.status != JobStatus.Open) revert WrongStatus(JobStatus.Open, job.status);
        if (job.provider != address(0)) revert WrongStatus(JobStatus.Open, job.status);
        if (provider == address(0)) revert ZeroAddress();

        // State written before hook calls (checks-effects-interactions).
        job.provider = provider;

        bytes memory data = abi.encode(provider, optParams);
        _callBeforeAction(job.hook, _SET_PROVIDER_SELECTOR, jobId, data);
        _callAfterAction(job.hook, _SET_PROVIDER_SELECTOR, jobId, data);
        emit ProviderSet(jobId, provider);
    }

    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        Job storage job = _jobs[jobId];

        if (msg.sender != job.client && msg.sender != job.provider) revert NotClient();
        if (job.status != JobStatus.Open) revert WrongStatus(JobStatus.Open, job.status);
        if (amount == 0) revert BudgetZero();

        // State written before hook calls (checks-effects-interactions).
        job.budget = amount;

        bytes memory data = abi.encode(amount, optParams);
        _callBeforeAction(job.hook, _SET_BUDGET_SELECTOR, jobId, data);
        _callAfterAction(job.hook, _SET_BUDGET_SELECTOR, jobId, data);
        emit BudgetSet(jobId, amount);
    }

    function fund(uint256 jobId, bytes calldata optParams) external nonReentrant {
        Job storage job = _jobs[jobId];

        if (msg.sender != job.client) revert NotClient();
        if (job.status != JobStatus.Open) revert WrongStatus(JobStatus.Open, job.status);
        if (job.provider == address(0)) revert ZeroAddress();
        if (job.budget == 0) revert BudgetZero();

        job.status = JobStatus.Funded;

        bytes memory data = abi.encode(optParams);
        _callBeforeAction(job.hook, _FUND_SELECTOR, jobId, data);

        USDC.safeTransferFrom(msg.sender, address(this), job.budget);

        _callAfterAction(job.hook, _FUND_SELECTOR, jobId, data);
        emit JobFunded(jobId, msg.sender, job.budget);
    }

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external nonReentrant {
        Job storage job = _jobs[jobId];

        if (msg.sender != job.provider) revert NotProvider();
        if (job.status != JobStatus.Funded) revert WrongStatus(JobStatus.Funded, job.status);
        if (block.timestamp >= job.expiredAt) revert Expired();
        if (optParams.length > _MAX_OPT_PARAMS_LENGTH) revert TooLong();
        // Always enforce the deliverable commitment, including the empty-params case
        // (keccak256("") is a valid commitment; a zero deliverable with empty params is explicit).
        if (keccak256(optParams) != deliverable) revert HashMismatch();

        job.status = JobStatus.Submitted;
        job.deliverable = deliverable;

        bytes memory data = abi.encode(deliverable, optParams);
        _callBeforeActionSafe(job.hook, _SUBMIT_SELECTOR, jobId, data);
        _callAfterActionSafe(job.hook, _SUBMIT_SELECTOR, jobId, data);

        emit JobSubmitted(jobId, msg.sender, deliverable, optParams);
    }

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _jobs[jobId];

        if (msg.sender != job.evaluator) revert NotEvaluator();
        if (job.status != JobStatus.Submitted) revert WrongStatus(JobStatus.Submitted, job.status);
        // After expiredAt the claimRefund path takes precedence; reject evaluator settlement.
        if (block.timestamp >= job.expiredAt) revert Expired();
        if (optParams.length > _MAX_OPT_PARAMS_LENGTH) revert TooLong();
        // Defensive: evaluator is always non-zero (checked at createJob/createAndFund).
        // Provider is always non-zero by the time status is Submitted (fund() enforces it).
        if (job.provider == address(0) || job.evaluator == address(0)) revert ZeroAddress();

        job.status = JobStatus.Completed;

        uint256 evaluatorFee = (job.budget * evaluatorFeeBps) / 10_000;
        uint256 providerPayout = job.budget - evaluatorFee;

        bytes memory data = abi.encode(reason, optParams, providerPayout, evaluatorFee);
        _callBeforeActionSafe(job.hook, _COMPLETE_SELECTOR, jobId, data);

        if (job.evaluator == job.provider) {
            _safeTransferOrDefer(jobId, job.provider, job.budget);
        } else {
            _safeTransferOrDefer(jobId, job.provider, providerPayout);
            if (evaluatorFee > 0) {
                _safeTransferOrDefer(jobId, job.evaluator, evaluatorFee);
            }
        }

        _stats[job.provider].jobsCompleted++;
        _stats[job.provider].usdcEarned += providerPayout;
        _stats[job.evaluator].usdcEarnedAsEvaluator += evaluatorFee;
        _stats[job.client].usdcSpent += job.budget;

        totalSettled += job.budget;

        _callAfterActionSafe(job.hook, _COMPLETE_SELECTOR, jobId, data);
        emit JobCompleted(jobId, msg.sender, reason, optParams, providerPayout, evaluatorFee);
    }

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _jobs[jobId];
        JobStatus current = job.status;

        bool isClient = msg.sender == job.client;
        bool isEvaluator = msg.sender == job.evaluator;

        if (!isClient && !isEvaluator) revert NotEvaluator();
        if (isClient && current != JobStatus.Open) revert WrongStatus(JobStatus.Open, current);
        if (isEvaluator && current != JobStatus.Funded && current != JobStatus.Submitted) {
            revert WrongStatus(JobStatus.Funded, current);
        }
        if (optParams.length > _MAX_OPT_PARAMS_LENGTH) revert TooLong();

        // Only transfer escrowed funds if the job was actually funded (Funded or Submitted).
        // An Open-state rejection has no escrowed tokens; transferring job.budget in that case
        // would drain USDC deposited by other jobs.
        uint256 refundAmount = (current == JobStatus.Funded || current == JobStatus.Submitted) ? job.budget : 0;
        job.status = JobStatus.Rejected;

        bytes memory data = abi.encode(reason, optParams, refundAmount);
        if (job.hook != address(0)) {
            try IACPHook(job.hook).beforeAction(_REJECT_SELECTOR, jobId, data) {} catch {}
        }

        if (refundAmount > 0) {
            _safeTransferOrDefer(jobId, job.client, refundAmount);
            totalRefunded += refundAmount;
        }

        if (isClient) {
            _stats[job.client].jobsCancelledByClient++;
        } else if (isEvaluator && job.provider != address(0)) {
            _stats[job.provider].jobsRejectedAsProvider++;
        }

        _callAfterActionSafe(job.hook, _REJECT_SELECTOR, jobId, data);

        emit JobRejected(jobId, msg.sender, reason, optParams, refundAmount);
        if (refundAmount > 0) {
            emit Refunded(jobId, job.client, refundAmount);
        }
    }

    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];

        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) {
            revert WrongStatus(JobStatus.Funded, job.status);
        }
        if (block.timestamp < job.expiredAt) revert NotExpired();

        uint256 refundAmount = job.budget;
        job.status = JobStatus.Expired;

        bytes memory data = abi.encode(refundAmount);
        if (job.hook != address(0)) {
            try IACPHook(job.hook).beforeAction(_CLAIM_REFUND_SELECTOR, jobId, data) {} catch {}
        }

        _safeTransferOrDefer(jobId, job.client, refundAmount);
        totalRefunded += refundAmount;

        _callAfterActionSafe(job.hook, _CLAIM_REFUND_SELECTOR, jobId, data);

        emit Refunded(jobId, job.client, refundAmount);
    }

    function withdrawOwed() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        USDC.safeTransfer(msg.sender, amount);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    // ===== EXTENSIONS =====

    function createAndFund(address provider, address evaluator, uint256 expiredAt, string calldata description, uint256 budget)
        external
        nonReentrant
        returns (uint256 jobId)
    {
        if (provider == address(0) || evaluator == address(0)) revert ZeroAddress();
        if (budget == 0) revert BudgetZero();
        if (bytes(description).length > _MAX_DESCRIPTION_LENGTH) revert TooLong();
        if (expiredAt <= block.timestamp) revert ExpiryInPast();
        if (expiredAt > block.timestamp + _MAX_JOB_DURATION) revert ExpiryTooFar();

        jobId = ++jobCount;
        ++totalJobs;

        _jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: budget,
            expiredAt: expiredAt,
            status: JobStatus.Funded,
            hook: address(0),
            deliverable: bytes32(0),
            createdAt: block.timestamp
        });

        _stats[msg.sender].jobsPosted++;

        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, description);
        emit BudgetSet(jobId, budget);

        bytes memory setBudgetData = abi.encode(budget, bytes(""));
        _callBeforeAction(address(0), _SET_BUDGET_SELECTOR, jobId, setBudgetData);
        _callAfterAction(address(0), _SET_BUDGET_SELECTOR, jobId, setBudgetData);

        bytes memory fundData = abi.encode(bytes(""));
        _callBeforeAction(address(0), _FUND_SELECTOR, jobId, fundData);

        USDC.safeTransferFrom(msg.sender, address(this), budget);

        _callAfterAction(address(0), _FUND_SELECTOR, jobId, fundData);
        emit JobFunded(jobId, msg.sender, budget);
    }

    function getStats(address account) external view returns (Stats memory) {
        return _stats[account];
    }

    function _callBeforeAction(address hook, bytes4 selector, uint256 jobId, bytes memory data) internal {
        if (hook == address(0)) return;
        IACPHook(hook).beforeAction(selector, jobId, data);
    }

    function _callBeforeActionSafe(address hook, bytes4 selector, uint256 jobId, bytes memory data) internal {
        if (hook == address(0)) return;
        try IACPHook(hook).beforeAction(selector, jobId, data) {} catch {}
    }

    function _callAfterAction(address hook, bytes4 selector, uint256 jobId, bytes memory data) internal {
        if (hook == address(0)) return;
        IACPHook(hook).afterAction(selector, jobId, data);
    }

    function _callAfterActionSafe(address hook, bytes4 selector, uint256 jobId, bytes memory data) internal {
        if (hook == address(0)) return;
        try IACPHook(hook).afterAction(selector, jobId, data) {} catch {}
    }

    /// @dev Attempts a USDC transfer; on any failure (revert OR false return value) credits
    /// owed[recipient] and emits PayoutDeferred instead of reverting. The job has already been
    /// moved to its terminal state before this is called, so the job settles regardless.
    function _safeTransferOrDefer(uint256 jobId, address recipient, uint256 amount) internal {
        if (amount == 0) return;
        // Low-level call so a revert does not propagate.
        (bool ok, bytes memory returndata) =
            address(USDC).call(abi.encodeWithSelector(IERC20.transfer.selector, recipient, amount));
        // Treat as success only when the call did not revert AND the ERC-20 bool return (if
        // present) is true. Tokens that signal failure via `return false` instead of reverting
        // must also be caught here; otherwise funds would be neither paid nor deferred.
        bool transferred = ok && (returndata.length == 0 || abi.decode(returndata, (bool)));
        if (transferred) return;
        owed[recipient] += amount;
        emit PayoutDeferred(jobId, recipient, amount);
    }
}
