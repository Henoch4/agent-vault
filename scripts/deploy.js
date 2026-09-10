const { ethers, network } = require(`hardhat`);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with:`, deployer.address);
  console.log(`Network chainId:`, network.config.chainId);
  const expected = network.name === `botMainnet` ? 677 : network.name === `botTestnet` ? 968 : network.config.chainId;
  if (network.config.chainId !== expected) { throw new Error(`chain guard`); }
  const Vault = await ethers.getContractFactory(`AgentVault`);
  const vault = await Vault.deploy();
  await vault.waitForDeployment();
  const addr = await vault.getAddress();
  console.log(`AgentVault deployed to:`, addr);
  console.log(`Verify at: https://scan.botchain.ai/address/` + addr);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
