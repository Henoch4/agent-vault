const { ethers, network } = require(`hardhat`);
async function main() {
  const [signer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(signer.address);
  console.log(JSON.stringify({
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    address: signer.address,
    balanceBOT: ethers.formatEther(bal),
  }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
