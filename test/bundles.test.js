const { expect } = require(`chai`);
const { ethers } = require(`hardhat`);

describe(`AgentVault bundles`, function () {
  async function deploy() {
    const [owner, agent, t1, t2] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory(`AgentVault`);
    const vault = await Vault.deploy();
    return { owner, agent, t1, t2, vault };
  }

  const BUNDLE = ethers.id(`vendors-v1`);

  it(`bundle-only target is spendable, removal revokes`, async function () {
    const { owner, agent, t1, t2, vault } = await deploy();
    const vaultAddr = await vault.getAddress();
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther(`10`) });
    await vault.setAgent(agent.address, true);
    // NOTE: t1 is NOT added via setTarget — only via bundle.
    await vault.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`));
    await vault.createBundle(BUNDLE, `vendors`, [t1.address, t2.address]);
    expect(await vault.bundleMember(BUNDLE, t1.address)).to.equal(true);
    expect(await vault.bundleMemberCount(t1.address)).to.equal(1);
    expect(await vault.isTargetAllowed(t1.address)).to.equal(true);
    expect((await vault.getBundleTargets(BUNDLE)).length).to.equal(2);
    // wouldExecute agrees before spending gas
    const [ok] = await vault.wouldExecute(agent.address, ethers.ZeroAddress, t1.address, ethers.parseEther(`1`));
    expect(ok).to.equal(true);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, t1.address, ethers.parseEther(`1`), `0x`))
      .to.emit(vault, `Executed`);
    // removal revokes the bundle path
    await vault.removeTargetFromBundle(BUNDLE, t1.address);
    expect(await vault.bundleMemberCount(t1.address)).to.equal(0);
    expect(await vault.isTargetAllowed(t1.address)).to.equal(false);
    await expect(vault.connect(agent).execute(ethers.ZeroAddress, t1.address, 1, `0x`))
      .to.be.revertedWithCustomError(vault, `TargetDenied`);
  });

  it(`duplicate bundle membership reverts`, async function () {
    const { t1, vault } = await deploy();
    await vault.createBundle(BUNDLE, `vendors`, [t1.address]);
    await expect(vault.addTargetToBundle(BUNDLE, t1.address))
      .to.be.revertedWithCustomError(vault, `BundleExists`);
  });
});
