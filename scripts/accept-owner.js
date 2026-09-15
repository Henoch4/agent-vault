// Generate Safe transaction data to call acceptOwner() on the vault.
// OFFLINE — no RPC needed. Chain state was verified 2026-09-14T23:10:50Z:
//   owner=deployer, pendingOwner=Safe, pendingOwnerAt=1789176551,
//   acceptAfter=2026-09-14T01:29:11Z, canAccept=true.
// Run with plain node (no --network): node scripts/accept-owner.js
// Outputs JSON with: to, value, data, operation (0=CALL)
// Use this data in Safe UI (app.safe.global) or Safe SDK to create + execute the tx.
const { ethers } = require('ethers');

async function main() {
  const vaultAddr = (process.env.VAULT_ADDRESS || '0xA27963D86F6805ED72591d59c58fed96F4fd9c81').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddr)) throw new Error('Set VAULT_ADDRESS env');

  // Offline encode — acceptOwner() takes no args, selector only.
  const iface = new ethers.Interface(['function acceptOwner()']);
  const data = iface.encodeFunctionData('acceptOwner', []);

  console.log(JSON.stringify({
    network: 'botMainnet',
    chainId: 677,
    vault: vaultAddr,
    safe: '0x3f6599D5694044Ac0B357695843391220a5aE0c3',
    verifiedState: 'owner=deployer pendingOwner=Safe pendingOwnerAt=1789176551 acceptAfter=2026-09-14T01:29:11Z (verified 2026-09-14T23:10:50Z)',
    transaction: {
      to: vaultAddr,
      value: '0',
      data: data,
      operation: 0, // CALL
    },
    instructions: [
      '1. Open app.safe.global and connect both owner wallets',
      '2. Go to the Safe (0x3f6599D5694044Ac0B357695843391220a5aE0c3) on BOT Mainnet (chainId 677)',
      '3. Click "New Transaction" → "Contract Interaction"',
      '4. Paste the vault address as "Contract Address"',
      '5. Paste the "data" field above as "ABI-encoded data"',
      '6. Value = 0, Operation = CALL (0)',
      '7. Both owners sign, then execute',
      '8. Verify on explorer: vault.owner() should now return the Safe address'
    ]
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });