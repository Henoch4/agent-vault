// Check vault ownership status on mainnet
const { ethers } = require('hardhat');

async function main() {
  const vaultAddr = (process.env.VAULT_ADDRESS || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddr)) throw new Error('Set VAULT_ADDRESS env');
  const vault = await ethers.getContractAt('AgentVault', vaultAddr);
  const [owner, pendingOwner, pendingOwnerAt] = await Promise.all([
    vault.owner(),
    vault.pendingOwner(),
    vault.pendingOwnerAt()
  ]);
  const now = Math.floor(Date.now() / 1000);
  const acceptAfter = Number(pendingOwnerAt) + 172800; // 2 days
  console.log('owner:', owner);
  console.log('pendingOwner:', pendingOwner);
  console.log('pendingOwnerAt:', pendingOwnerAt.toString());
  console.log('acceptAfter (UTC):', new Date(acceptAfter * 1000).toISOString());
  console.log('now (UTC):', new Date(now * 1000).toISOString());
  console.log('canAccept:', now >= acceptAfter);
  console.log('secondsUntilAccept:', Math.max(0, acceptAfter - now));
}
main().catch(e => { console.error(e); process.exit(1); });