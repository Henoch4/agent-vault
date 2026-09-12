// Generates the persistent mainnet agent key ONCE and stores it in .env
// (gitignored, same handling as PRIVATE_KEY). Prints the ADDRESS only —
// the key itself is never printed, logged, or committed.
// Run once: npx hardhat run scripts/gen-agent.js --network botMainnet
const { ethers } = require(`hardhat`);
const fs = require(`fs`);
const path = require(`path`);
async function main() {
  const envPath = path.join(__dirname, `..`, `.env`);
  const cur = fs.existsSync(envPath) ? fs.readFileSync(envPath, `utf8`) : ``;
  if (/^AGENT_KEY=/m.test(cur)) {
    const w = new ethers.Wallet(cur.match(/^AGENT_KEY=(.*)$/m)[1].trim(), ethers.provider);
    console.log(JSON.stringify({ agent: w.address, created: false }));
    return;
  }
  const w = ethers.Wallet.createRandom();
  fs.appendFileSync(envPath, `\nAGENT_KEY=${w.privateKey}\n`);
  console.log(JSON.stringify({ agent: w.address, created: true }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
