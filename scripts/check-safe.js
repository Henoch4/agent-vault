// Reads back a Safe's owners + threshold (works on any chain, no UI needed).
//   SAFE_ADDRESS=0x... npx hardhat run scripts/check-safe.js --network botMainnet
const { network } = require(`hardhat`);
const ABI = [
  `function getOwners() view returns (address[])`,
  `function getThreshold() view returns (uint256)`,
];
async function main() {
  const { ethers } = require(`hardhat`);
  const addr = (process.env.SAFE_ADDRESS || ``).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error(`Set SAFE_ADDRESS env`);
  const provider = new ethers.JsonRpcProvider(network.config.url);
  const safe = new ethers.Contract(addr, ABI, provider);
  const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
  console.log(JSON.stringify({ network: network.name, safe: addr, owners, threshold: threshold.toString() }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
