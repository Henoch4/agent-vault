// Sets the starter policy on the mainnet vault (owner txs).
// Target defaults to the deployer wallet (self-payout loop first).
//   VAULT_ADDRESS=0x... [POLICY_TARGET=0x...] npx hardhat run scripts/setup-policy.js --network botMainnet
const { ethers, network } = require(`hardhat`);
async function main() {
  const [owner] = await ethers.getSigners();
  const vaultAddr = (process.env.VAULT_ADDRESS || `0xA27963D86F6805ED72591d59c58fed96F4fd9c81`).trim();
  const agentKey = (process.env.AGENT_KEY || ``).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(agentKey)) throw new Error(`AGENT_KEY missing in .env — run gen-agent.js first`);
  const agent = new ethers.Wallet(agentKey, ethers.provider);
  const target = (process.env.POLICY_TARGET || owner.address).trim();
  const NATIVE = ethers.ZeroAddress;
  const vault = await ethers.getContractAt(`AgentVault`, vaultAddr);

  // gas for the agent's future signatures (executor-paid, not a vault fund)
  if (await ethers.provider.getBalance(agent.address) < ethers.parseEther(`0.02`)) {
    await (await owner.sendTransaction({ to: agent.address, value: ethers.parseEther(`0.03`) })).wait();
  }
  const steps = [
    [`setAgent`, await (await vault.setAgent(agent.address, true)).wait()],
    [`setTarget`, await (await vault.setTarget(target, true)).wait()],
    [`setDailyLimit`, await (await vault.setDailyLimit(agent.address, NATIVE, ethers.parseEther(`0.5`))).wait()],
    [`setPerTxLimit`, await (await vault.setPerTxLimit(agent.address, NATIVE, ethers.parseEther(`0.1`))).wait()],
    [`setExecCooldown`, await (await vault.setExecCooldown(300)).wait()],
  ];
  // readback
  const [isAgent, isTarget, daily, ptx, cd] = await Promise.all([
    vault.agents(agent.address), vault.isTargetAllowed(target),
    vault.dailyLimit(agent.address, NATIVE), vault.perTxLimit(agent.address, NATIVE),
    vault.execCooldown(),
  ]);
  const [ok, reason] = await vault.wouldExecute(agent.address, NATIVE, target, ethers.parseEther(`0.05`));
  console.log(JSON.stringify({
    network: network.name, vault: vaultAddr,
    agent: agent.address, target,
    txs: steps.map(([n, rc]) => ({ [n]: rc.hash })),
    readback: {
      isAgent, isTargetAllowed: isTarget,
      dailyLimit: ethers.formatEther(daily), perTxCap: ethers.formatEther(ptx),
      cooldown: cd.toString(), dryRun005: { ok, reason },
    },
  }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
