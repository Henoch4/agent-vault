const { Wallet } = require(`ethers`);
const fs = require(`fs`);
const path = require(`path`);
const names = [`agent-vault`, `micro-predict`, `bot-launch`];
const out = [];
for (const n of names) {
  const w = Wallet.createRandom();
  out.push(n + `:` + w.address);
  fs.writeFileSync(path.join(`..`, `wallets`, n + `.json`), JSON.stringify({ address: w.address, privateKey: w.privateKey }, null, 2));
}
console.log(out.join(`---`));
