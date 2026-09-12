// Starts (or reports) the timelocked owner rotation on the mainnet vault.
//   VAULT_ADDRESS=0x... NEW_OWNER=0x... npx hardhat run scripts/propose-owner.js --network botMainnet
const { ethers, network } = require(`hardhat`);
async function main() {
  const [owner] = await ethers.getSigners();
  const vaultAddr = (process.env.VAULT_ADDRESS || ``).trim();
  const next = (process.env.NEW_OWNER || ``).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddr)) throw new Error(`Set VAULT_ADDRESS env`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(next)) throw new Error(`Set NEW_OWNER env`);
  const vault = await ethers.getContractAt(`AgentVault`, vaultAddr);
  const current = await vault.owner();
  if (current.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(`Signer ${owner.address} is not the current owner (${current})`);
  }
  const tx = await vault.proposeOwner(next);
  const rc = await tx.wait();
  const at = await vault.pendingOwnerAt();
  console.log(JSON.stringify({
    network: network.name,
    vault: vaultAddr,
    currentOwner: current,
    pendingOwner: await vault.pendingOwner(),
    pendingOwnerAt: at.toString(),
    acceptAfterUTC: new Date((Number(at) + 2 * 86400) * 1000).toISOString(),
    txHash: rc.hash,
  }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
