const { expect } = require(`chai`);
const { ethers } = require(`hardhat`);
const { VaultSDK } = require(`../sdk/index.js`);
const { vaultSpendTool } = require(`../sdk/langchain.js`);

describe(`@agentvault/sdk`, function () {
  async function setup() {
    const [owner, agent, vendor] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory(`AgentVault`);
    const vault = await Vault.deploy();
    const addr = await vault.getAddress();
    await owner.sendTransaction({ to: addr, value: ethers.parseEther(`10`) });
    const ownerSdk = new VaultSDK(owner, addr);
    await (await ownerSdk.setAgent(agent.address, true)).wait();
    await (await ownerSdk.setTarget(vendor.address, true)).wait();
    await (await ownerSdk.setDailyLimit(agent.address, ethers.ZeroAddress, ethers.parseEther(`5`))).wait();
    const agentSdk = new VaultSDK(agent, addr);
    return { owner, agent, vendor, addr, ownerSdk, agentSdk };
  }

  it(`spend() sends within policy, blocks outside it without gas waste`, async function () {
    const { agent, vendor, agentSdk } = await setup();
    const check = await agentSdk.wouldSpend(agent.address, ethers.ZeroAddress, vendor.address, ethers.parseEther(`1`));
    expect(check.ok).to.equal(true);
    await expect(await agentSdk.spend(ethers.ZeroAddress, vendor.address, ethers.parseEther(`1`))).to.not.be.null;
    await expect(agentSdk.spend(ethers.ZeroAddress, vendor.address, ethers.parseEther(`99`)))
      .to.be.rejectedWith(/OverLimit/);
  });

  it(`langchain tool func sends and reports blocked spends as text`, async function () {
    const { agent, vendor, agentSdk } = await setup();
    const tool = vaultSpendTool(agentSdk, { agentAddress: agent.address });
    expect(tool.name).to.equal(`vault_spend`);
    const sent = await tool.func({ target: vendor.address, amountWei: ethers.parseEther(`1`).toString() });
    expect(sent.startsWith(`SENT:`)).to.equal(true);
    const blocked = await tool.func({ target: vendor.address, amountWei: ethers.parseEther(`99`).toString() });
    expect(blocked.startsWith(`BLOCKED:`)).to.equal(true);
  });
});
