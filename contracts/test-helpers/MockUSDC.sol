// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Standard mock USDC with 6 decimals, a public mint function, and an
///      optional blocklist that simulates Circle USDC address blocking.
contract MockUSDC is ERC20 {
    uint8 private immutable _decimals;

    mapping(address => bool) public blocklisted;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocklisted(address addr, bool blocked) external {
        blocklisted[addr] = blocked;
    }

    /// @dev Override transfer to simulate Circle USDC blocklist behaviour.
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (blocklisted[to]) revert("MockUSDC: blocklisted");
        return super.transfer(to, amount);
    }
}

/// @dev Malicious USDC whose transferFrom reenters AgenticCommerce.fund() on the
///      second call, to verify ReentrancyGuard blocks it.
interface IReentrantTarget {
    function fund(uint256 jobId, bytes calldata optParams) external;
}

contract MaliciousUSDC is ERC20 {
    uint8 private immutable _decimals;
    address public target;      // AgenticCommerce address
    uint256 public reentrantJobId;
    bool public armed;          // flip to true before the attack tx
    bool private _attacking;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, uint256 jobId_) external {
        target = target_;
        reentrantJobId = jobId_;
        armed = true;
    }

    /// @dev On the second transferFrom (the actual fund transfer), re-enter fund().
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (armed && !_attacking) {
            _attacking = true;
            // Attempt reentrant fund() — should revert with ReentrancyGuard
            try IReentrantTarget(target).fund(reentrantJobId, "") {} catch {}
            _attacking = false;
        }
        return super.transferFrom(from, to, amount);
    }
}
