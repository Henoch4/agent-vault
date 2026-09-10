// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AgentVault {
    address public owner;
    uint256 private guardFlag = 1;
    bool public paused;
    mapping(address => bool) public agents;
    mapping(address => bool) public targets;
    mapping(address => mapping(address => uint256)) public dailyLimit;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public spent;
    mapping(address => mapping(address => uint256)) public perTxLimit;
    mapping(address => uint256) public lastExec;
    uint256 public execCooldown;
    address public pendingOwner;
    uint256 public pendingOwnerAt;
    uint256 public constant OWNER_ROTATION_DELAY = 2 days;

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

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    modifier noReentry() {
        if (guardFlag != 1) revert Locked();
        guardFlag = 2;
        _;
        guardFlag = 1;
    }

    modifier whenNotPaused() {
        if (paused == true) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
    }
    receive() external payable {}

    function safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (ok != true) revert CallFailed();
        if (ret.length != 0 && abi.decode(ret, (bool)) != true) revert CallFailed();
    }

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
    function execute(address token, address payable target, uint256 amount, bytes calldata data) external noReentry whenNotPaused {
        if (agents[msg.sender] != true) revert NotAgent();
        if (targets[target] != true) revert TargetDenied();
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
            if (ok != true) revert CallFailed();
        } else {
            safeTransfer(token, target, amount);
        }
        emit Executed(msg.sender, token, target, amount);
    }
    function ownerWithdraw(address token, uint256 amount, address payable to) external onlyOwner noReentry {
        bytes memory empty;
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}(empty);
            if (ok != true) revert CallFailed();
        } else {
            safeTransfer(token, to, amount);
        }
        emit Withdrawn(token, amount);
    }
    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

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

    function daySpent(address agent, address token) external view returns (uint256) {
        return spent[agent][token][block.timestamp / 1 days];
    }
}