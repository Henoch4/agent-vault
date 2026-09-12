// Public demo agent: an autonomous loop that spends inside policy and gets
// denied outside it — the "trust the code, not the agent" pitch made observable.
//
//   VAULT_ADDRESS=0x7CF3... [AGENT_KEY=0x...] npx hardhat run scripts/demo-agent.js --network botTestnet
//
// If AGENT_KEY is unset, an ephemeral agent key is generated and funded with
// gas by the owner. All decisions go through the SDK (dry-run first).
const { ethers, network } = require(`hardhat`);
const { VaultSDK } = require(`../sdk/index.js`);
const { vaultSpendTool } = require(`../sdk/langchain.js`);

const VAULT = process.env.VAULT_ADDRESS;
const NATIVE = ethers.ZeroAddress;

async function main() {
  if (!VAULT) throw new Error(`Set VAULT_ADDRESS env`);
  const [owner] = await ethers.getSigners();
  const provider = owner.provider;
  let agent;
  if (process.env.AGENT_KEY) {
    agent = new ethers.Wallet(process.env.AGENT_KEY, provider);
  } else {
    agent = ethers.Wallet.createRandom().connect(provider);
    await (await owner.sendTransaction({ to: agent.address, value: ethers.parseEther(`0.05`) })).wait();
    console.log(JSON.stringify({ demo: `agent-funded`, agent: agent.address }));
  }
  const vendor = ethers.Wallet.createRandom().address;

  const ownerSdk = new VaultSDK(owner, VAULT);
  const agentSdk = new VaultSDK(agent, VAULT);
  const tool = vaultSpendTool(agentSdk, { agentAddress: agent.address });

  await (await owner.sendTransaction({ to: VAULT, value: ethers.parseEther(`0.5`) })).wait();
  await (await ownerSdk.setAgent(agent.address, true)).wait();
  await (await ownerSdk.setTarget(vendor, true)).wait();
  await (await ownerSdk.setDailyLimit(agent.address, NATIVE, ethers.parseEther(`0.2`))).wait();
  await (await ownerSdk.setPerTxLimit(agent.address, NATIVE, ethers.parseEther(`0.1`))).wait();
  console.log(JSON.stringify({ demo: `policy-set`, vault: VAULT, network: network.name, agent: agent.address, vendor }));

  // 1. In-policy spend: succeeds.
  console.log(await tool.func({ target: vendor, amountWei: ethers.parseEther(`0.05`).toString() }));
  // 2. Over per-tx cap: blocked, no gas wasted on a revert.
  console.log(await tool.func({ target: vendor, amountWei: ethers.parseEther(`0.15`).toString() }));
  // 3. Unallowlisted destination: blocked.
  console.log(await tool.func({ target: ethers.Wallet.createRandom().address, amountWei: ethers.parseEther(`0.01`).toString() }));

  const spent = await agentSdk.daySpent(agent.address, NATIVE);
  console.log(JSON.stringify({ demo: `done`, daySpentWei: spent.toString(), explorer: `https://scan.bohr.life/address/${VAULT}` }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
