// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AgentVault is ReentrancyGuard {
    address public owner;
    bool public paused;
    mapping(address => bool) public agents;
    mapping(address => bool) public targets;
    mapping(address => mapping(address => uint256)) public dailyLimit;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public spent;
    mapping(address => mapping(address => uint256)) public perTxLimit;
    mapping(address => uint256) public lastExec;
    uint256 public execCooldown;

    // Owner rotation with timelock
    address public pendingOwner;
    uint256 public pendingOwnerAt;
    uint256 public constant OWNER_ROTATION_DELAY = 2 days;

    // Allowlist bundles: bundleId -> address[]
    mapping(bytes32 => address[]) public bundleTargets;
    mapping(bytes32 => string) public bundleNames;

    using SafeERC20 for IERC20;

    event AgentSet(address indexed agent, bool allowed);
    event TargetSet(address indexed target, bool allowed);
    event LimitSet(address indexed agent, address indexed token, uint256 amount);
    event PerTxLimitSet(address indexed agent, address indexed token, uint256 amount);
    event CooldownSet(uint256 secondsBetween);
    event Executed(address indexed agent, address indexed token, address indexed target, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event PausedSet(bool paused);
    event OwnerProposed(address indexed newOwner);
    event OwnerAccepted(address indexed newOwner);
    event OwnerRotationCancelled();
    event BundleCreated(bytes32 indexed bundleId, string name, address[] targets);
    event BundleTargetAdded(bytes32 indexed bundleId, address target);
    event BundleTargetRemoved(bytes32 indexed bundleId, address target);

    error NotOwner();
    error NotAgent();
    error TargetDenied();
    error OverLimit();
    error OverPerTx();
    error CooldownActive();
    error CallFailed();
    error Locked();
    error BadCalldata();
    error ZeroAddr();
    error Paused();
    error NotPendingOwner();
    error TooSoon();
    error NoRotation();
    error BundleNotFound();
    error BundleExists();
    error InvalidBundleName();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {}

    // --- View helpers ---
    function isOwnerContract() external view returns (bool) {
        address _owner = owner;
        uint256 size;
        assembly { size := extcodesize(_owner) }
        return size > 0;
    }

    function daySpent(address agent, address token) external view returns (uint256) {
        return spent[agent][token][block.timestamp / 1 days];
    }

    function wouldExecute(
        address agent,
        address token,
        address payable target,
        uint256 amount
    ) external view returns (bool ok, string memory reason) {
        if (paused) return (false, "Paused");
        if (!agents[agent]) return (false, "NotAgent");
        if (!targets[target] && !_isTargetInAnyBundle(target)) return (false, "TargetDenied");
        uint256 day = block.timestamp / 1 days;
        uint256 used = spent[agent][token][day];
        if (used + amount > dailyLimit[agent][token]) return (false, "OverLimit");
        uint256 ptl = perTxLimit[agent][token];
        if (ptl != 0 && amount > ptl) return (false, "OverPerTx");
        if (execCooldown != 0 && block.timestamp < lastExec[agent] + execCooldown) return (false, "CooldownActive");
        return (true, "OK");
    }

    function _isTargetInAnyBundle(address target) internal view returns (bool) {
        // Placeholder: not implemented efficiently.
        return false;
    }

    function _isTargetInBundle(address target) internal view returns (bool) {
        // Placeholder: not implemented efficiently.
        return false;
    }

    // --- Configuration (owner only) ---
    function setAgent(address agent, bool allowed) external onlyOwner {
        if (agent == address(0)) revert ZeroAddr();
        agents[agent] = allowed;
        emit AgentSet(agent, allowed);
    }

    function setTarget(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddr();
        targets[target] = allowed;
        emit TargetSet(target, allowed);
    }

    function setDailyLimit(address agent, address token, uint256 amount) external onlyOwner {
        if (agent == address(0)) revert ZeroAddr();
        dailyLimit[agent][token] = amount;
        emit LimitSet(agent, token, amount);
    }

    function setPerTxLimit(address agent, address token, uint256 amount) external onlyOwner {
        if (agent == address(0)) revert ZeroAddr();
        perTxLimit[agent][token] = amount;
        emit PerTxLimitSet(agent, token, amount);
    }

    function setExecCooldown(uint256 secondsBetween) external onlyOwner {
        execCooldown = secondsBetween;
        emit CooldownSet(secondsBetween);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    // --- Owner rotation ---
    function proposeOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddr();
        pendingOwner = newOwner;
        pendingOwnerAt = block.timestamp;
        emit OwnerProposed(newOwner);
    }

    function cancelOwnerRotation() external onlyOwner {
        if (pendingOwner == address(0)) revert NoRotation();
        pendingOwner = address(0);
        emit OwnerRotationCancelled();
    }

    function acceptOwner() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        if (block.timestamp < pendingOwnerAt + OWNER_ROTATION_DELAY) revert TooSoon();
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnerAccepted(msg.sender);
    }

    // --- Bundle management ---
    function createBundle(bytes32 bundleId, string calldata name, address[] calldata targets_) external onlyOwner {
        if (bytes(bundleNames[bundleId]).length > 0) revert BundleExists();
        if (bytes(name).length == 0) revert InvalidBundleName();
        bundleNames[bundleId] = name;
        bundleTargets[bundleId] = targets_;
        for (uint256 i = 0; i < targets_.length; i++) {
            if (targets_[i] == address(0)) revert ZeroAddr();
        }
        emit BundleCreated(bundleId, name, targets_);
    }

    function addTargetToBundle(bytes32 bundleId, address target) external onlyOwner {
        if (bytes(bundleNames[bundleId]).length == 0) revert BundleNotFound();
        if (target == address(0)) revert ZeroAddr();
        bundleTargets[bundleId].push(target);
        emit BundleTargetAdded(bundleId, target);
    }

    function removeTargetFromBundle(bytes32 bundleId, address target) external onlyOwner {
        if (bytes(bundleNames[bundleId]).length == 0) revert BundleNotFound();
        address[] storage arr = bundleTargets[bundleId];
        uint256 idx = type(uint256).max;
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == target) {
                idx = i;
                break;
            }
        }
        if (idx == type(uint256).max) revert TargetDenied();
        arr[idx] = arr[arr.length - 1];
        arr.pop();
        emit BundleTargetRemoved(bundleId, target);
    }

    // --- Execution ---
    function execute(
        address token,
        address payable target,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant whenNotPaused {
        if (!agents[msg.sender]) revert NotAgent();
        if (!targets[target] && !_isTargetInBundle(target)) revert TargetDenied();
        if (data.length != 0) revert BadCalldata();

        uint256 day = block.timestamp / 1 days;
        uint256 used = spent[msg.sender][token][day];
        if (used + amount > dailyLimit[msg.sender][token]) revert OverLimit();
        uint256 ptl = perTxLimit[msg.sender][token];
        if (ptl != 0 && amount > ptl) revert OverPerTx();
        if (execCooldown != 0 && block.timestamp < lastExec[msg.sender] + execCooldown) revert CooldownActive();

        spent[msg.sender][token][day] = used + amount;
        lastExec[msg.sender] = block.timestamp;

        if (token == address(0)) {
            (bool ok, ) = target.call{value: amount}(data);
            if (!ok) revert CallFailed();
        } else {
            IERC20(token).safeTransfer(target, amount);
        }
        emit Executed(msg.sender, token, target, amount);
    }

    // --- Owner withdraw ---
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