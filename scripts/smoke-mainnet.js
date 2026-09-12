// Read-only mainnet smoke test: no transactions, no state changes.
const { ethers, network } = require(`hardhat`);
const VAULT = `0xA27963D86F6805ED72591d59c58fed96F4fd9c81`;
async function main() {
  const vault = await ethers.getContractAt(`AgentVault`, VAULT);
  const [owner, paused, isContract] = await Promise.all([
    vault.owner(), vault.paused(), vault.isOwnerContract(),
  ]);
  const stranger = `0x000000000000000000000000000000000000dEaD`;
  const [ok, reason] = await vault.wouldExecute(stranger, ethers.ZeroAddress, stranger, 1n);
  console.log(JSON.stringify({
    network: network.name,
    vault: VAULT,
    owner, paused, isOwnerContract: isContract,
    dryRunStranger: { ok, reason },
  }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
