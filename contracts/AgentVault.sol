// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./policy/PolicyEngine.sol";

/// @title AgentVault
/// @author AgentVault / BOT Chain
/// @notice Policy-gated spending vault: thin fund-movement layer over the
/// shared, audited PolicyEngine base (`contracts/policy/PolicyEngine.sol`).
/// All authorization, limits, cooldown, pause, bundles, and timelocked
/// ownership live in the base — this contract only moves funds after the
/// policy gate passes. Reuse the base (not this wrapper) for sibling apps.
contract AgentVault is PolicyEngine, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Spend native BOT or ERC20 to an allowlisted target, within policy.
    function execute(
        address token,
        address payable target,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant whenNotPaused {
        if (data.length != 0) revert BadCalldata();
        _checkPolicy(msg.sender, token, target, amount);

        if (token == address(0)) {
            (bool ok, ) = target.call{value: amount}(data);
            if (!ok) revert CallFailed();
        } else {
            IERC20(token).safeTransfer(target, amount);
        }
        emit Executed(msg.sender, token, target, amount);
    }

    /// @notice Owner escape hatch: move any amount anywhere, instantly.
    /// @dev Trust root by design — the owner MUST be a multisig. See docs/THREAT_MODEL.md (T5).
    function ownerWithdraw(
        address token,
        uint256 amount,
        address payable to
    ) external onlyOwner nonReentrant {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert CallFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit Withdrawn(token, amount);
    }
}
