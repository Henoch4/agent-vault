// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PolicyEngine
/// @author AgentVault / BOT Chain
/// @notice Shared, auditable policy primitive for BOT Chain agent apps
/// (AgentVault, MicroPredict, BotLaunch): allowlisted spenders, allowlisted
/// destinations (+ named bundles with an O(1) membership index), per-token
/// daily limits, per-tx caps, execution cooldown, pausability, and timelocked
/// ownership rotation. Holds NO funds logic itself — inheriting contracts add
/// fund movement (vault spends, market payouts, LP locks) on top.
/// @dev Storage layout is part of the interface: append-only, never reorder.
/// Audit once, reuse across all three flagship apps.
contract PolicyEngine {
    // --- Ownership (timelocked rotation) ---
    address public owner;
    // --- Circuit breaker ---
    bool public paused;
    // --- Policy state (declaration order = storage layout, do not reorder) ---
    mapping(address => bool) public agents;
    mapping(address => bool) public targets;
    mapping(address => mapping(address => uint256)) public dailyLimit;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public spent;
    mapping(address => mapping(address => uint256)) public perTxLimit;
    mapping(address => uint256) public lastExec;
    uint256 public execCooldown;

    // --- Owner rotation with timelock ---
    address public pendingOwner;
    uint256 public pendingOwnerAt;
    uint256 public constant OWNER_ROTATION_DELAY = 2 days;

    // --- Allowlist bundles ---
    mapping(bytes32 => address[]) public bundleTargets;
    mapping(bytes32 => string) public bundleNames;
    // O(1) membership index: target -> number of bundles containing it
    mapping(bytes32 => mapping(address => bool)) public bundleMember;
    mapping(address => uint256) public bundleMemberCount;

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

    /// @notice True if `target` sits in at least one bundle (O(1) ref-count).
    function _isTargetInAnyBundle(address target) internal view returns (bool) {
        return bundleMemberCount[target] > 0;
    }

    function _isTargetInBundle(address target) internal view returns (bool) {
        return bundleMemberCount[target] > 0;
    }

    /// @notice Public read helper: direct allowlist OR any bundle membership.
    function isTargetAllowed(address target) external view returns (bool) {
        return targets[target] || bundleMemberCount[target] > 0;
    }

    /// @notice Full bundle member list (for SDK / relayer / UI).
    function getBundleTargets(bytes32 bundleId) external view returns (address[] memory) {
        return bundleTargets[bundleId];
    }

    /// @notice Shared policy gate. Reverts with the legible reason on failure.
    /// Inheriting contracts call this, then move funds.
    function _checkPolicy(address agent, address token, address target, uint256 amount) internal {
        if (!agents[agent]) revert NotAgent();
        if (!targets[target] && bundleMemberCount[target] == 0) revert TargetDenied();
        uint256 day = block.timestamp / 1 days;
        uint256 used = spent[agent][token][day];
        if (used + amount > dailyLimit[agent][token]) revert OverLimit();
        uint256 ptl = perTxLimit[agent][token];
        if (ptl != 0 && amount > ptl) revert OverPerTx();
        if (execCooldown != 0 && block.timestamp < lastExec[agent] + execCooldown) revert CooldownActive();
        spent[agent][token][day] = used + amount;
        lastExec[agent] = block.timestamp;
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
        for (uint256 i = 0; i < targets_.length; i++) {
            if (targets_[i] == address(0)) revert ZeroAddr();
            if (bundleMember[bundleId][targets_[i]]) revert BundleExists();
            bundleMember[bundleId][targets_[i]] = true;
            bundleMemberCount[targets_[i]] += 1;
            bundleTargets[bundleId].push(targets_[i]);
        }
        emit BundleCreated(bundleId, name, targets_);
    }

    function addTargetToBundle(bytes32 bundleId, address target) external onlyOwner {
        if (bytes(bundleNames[bundleId]).length == 0) revert BundleNotFound();
        if (target == address(0)) revert ZeroAddr();
        if (bundleMember[bundleId][target]) revert BundleExists();
        bundleMember[bundleId][target] = true;
        bundleMemberCount[target] += 1;
        bundleTargets[bundleId].push(target);
        emit BundleTargetAdded(bundleId, target);
    }

    function removeTargetFromBundle(bytes32 bundleId, address target) external onlyOwner {
        if (bytes(bundleNames[bundleId]).length == 0) revert BundleNotFound();
        if (!bundleMember[bundleId][target]) revert TargetDenied();
        address[] storage arr = bundleTargets[bundleId];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == target) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
        bundleMember[bundleId][target] = false;
        bundleMemberCount[target] -= 1;
        emit BundleTargetRemoved(bundleId, target);
    }
}
