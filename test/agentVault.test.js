const { expect } = require(`chai`);
const { ethers } = require(`hardhat`);

describe(`AgentVault`, function () {
  async function deploy() {
    const [owner, agent, user] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory(`AgentVault`);
    const vault = await Vault.deploy();
    const Token = await ethers.getContractFactory(`MockERC20`);
    const token = await Token.deploy();
    return { owner, agent, user, vault, token };
  }

  it(`owner configures agent, target and limit`, async function () {
    const { agent, user, vault } = await deploy();
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    expect(await vault.agents(agent.address)).to.equal(true);
    expect(await vault.targets(user.address)).to.equal(true);
  });

  it(`agent executes native transfer inside daily limit`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`1`), `0x`))
      .to.emit(vault, `Executed`);
    expect(await vault.daySpent(agent.address, ethers.ZeroAddress)).to.equal(ethers.parseEther(`1`));
  });

  it(`reverts when amount exceeds daily limit`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`1`), `0x`);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`5`), `0x`))
      .to.be.revertedWithCustomError(vault, `OverLimit`);
  });

  it(`reverts for non-agent and denied target`, async function () {
    const { agent, user, vault } = await deploy();
    await vault.setTarget(user.address, true);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, 1, `0x`))
      .to.be.revertedWithCustomError(vault, `NotAgent`);
    await vault.setAgent(agent.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, agent.address, 1, `0x`))
      .to.be.revertedWithCustomError(vault, `TargetDenied`);
  });

  it(`allowance resets next day`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`20`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`5`), `0x`);
    await ethers.provider.send(`evm_increaseTime`, [86400]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`5`), `0x`))
      .to.emit(vault, `Executed`);
  });

  it(`agent spends ERC20 inside token scoped limit`, async function () {
    const { agent, user, vault, token } = await deploy();
    const vaultAddr = await vault.getAddress();
    const tokenAddr = await token.getAddress();
    await token.mint(vaultAddr, 1000);
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, tokenAddr, 400);
    await expect(vault.connect(agent).execute(tokenAddr, user.address, 100, `0x`))
      .to.emit(vault, `Executed`);
    expect(await token.balanceOf(user.address)).to.equal(100);
    await expect(vault.connect(agent).execute(tokenAddr, user.address, 500, `0x`))
      .to.be.revertedWithCustomError(vault, `OverLimit`);
  });

  it(`rejects non-empty calldata, bare transfers only`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, 1, `0x1234`))
      .to.be.revertedWithCustomError(vault, `BadCalldata`);
  });

  it(`rejects zero address in config`, async function () {
    const { vault } = await deploy();
    await expect(vault.setAgent(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(vault, `ZeroAddr`);
    await expect(vault.setTarget(ethers.ZeroAddress, true))
      .to.be.revertedWithCustomError(vault, `ZeroAddr`);
    await expect(vault.setDailyLimit(ethers.ZeroAddress, ethers.ZeroAddress, 1))
      .to.be.revertedWithCustomError(vault, `ZeroAddr`);
  });

  it(`supports tokens with no return value`, async function () {
    const { agent, user, vault } = await deploy();
    const NoRet = await ethers.getContractFactory(`NoReturnERC20`);
    const noRet = await NoRet.deploy();
    const vaultAddr = await vault.getAddress();
    const tokenAddr = await noRet.getAddress();
    await noRet.mint(vaultAddr, 1000);
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, tokenAddr, 400);
    await expect(vault.connect(agent).execute(tokenAddr, user.address, 100, `0x`))
      .to.emit(vault, `Executed`);
    expect(await noRet.balanceOf(user.address)).to.equal(100);
  });

it(`pause blocks executes and unpause restores`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await vault.setPaused(true);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, 1, `0x`))
      .to.be.revertedWithCustomError(vault, `Paused`);
    await vault.setPaused(false);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, 1, `0x`))
      .to.emit(vault, `Executed`);
  });

  it(`enforces per-tx cap inside daily limit`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await vault.setPerTxLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`1`));
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`1`), `0x`))
      .to.emit(vault, `Executed`);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`2`), `0x`))
      .to.be.revertedWithCustomError(vault, `OverPerTx`);
    expect(await vault.daySpent(agent.address, ethers.ZeroAddress)).to.equal(ethers.parseEther(`1`));
  });

  it(`cooldown blocks a second execute until window passes`, async function () {
    const { owner, agent, user, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    await vault.setTarget(user.address, true);
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await vault.setExecCooldown(120);
    await vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`1`), `0x`);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`1`), `0x`))
      .to.be.revertedWithCustomError(vault, `CooldownActive`);
    await ethers.provider.send(`evm_increaseTime`, [121]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, user.address, ethers.parseEther(`1`), `0x`))
      .to.emit(vault, `Executed`);
  });

  it(`owner rotation is two-step with delay and cancels cleanly`, async function () {
    const { owner, agent, user, vault } = await deploy();
    await vault.proposeOwner(user.address);
    await ethers.provider.send(`evm_increaseTime`, [2 * 86400 - 60]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(vault.connect(user).acceptOwner()).to.be.revertedWithCustomError(vault, `TooSoon`);
    await ethers.provider.send(`evm_increaseTime`, [120]);
    await ethers.provider.send(`evm_mine`, []);
    await expect(vault.connect(user).acceptOwner()).to.emit(vault, `OwnerAccepted`);
    expect(await vault.owner()).to.equal(user.address);
    await expect(vault.connect(agent).setAgent(agent.address, true)).to.be.revertedWithCustomError(vault, `NotOwner`);
    await vault.connect(user).setAgent(agent.address, true);
    expect(await vault.agents(agent.address)).to.equal(true);
  });

  it(`owner can cancel a pending rotation`, async function () {
    const { agent, user, vault } = await deploy();
    const before = await vault.owner();
    await vault.proposeOwner(user.address);
    await vault.cancelOwnerRotation();
    await expect(vault.connect(user).acceptOwner()).to.be.revertedWithCustomError(vault, `NotPendingOwner`);
    expect(await vault.owner()).to.equal(before);
    await expect(vault.cancelOwnerRotation()).to.be.revertedWithCustomError(vault, `NoRotation`);
  });
});
