// Spend-receipt relayer: tails AgentVault events, prints structured JSON receipts,
// and optionally POSTs each receipt to WEBHOOK_URL.
//
// Usage:
//   VAULT_ADDRESS=0x... npx hardhat run scripts/relayer.js --network botTestnet -- --once
//   VAULT_ADDRESS=0x... WEBHOOK_URL=https://... npx hardhat run scripts/relayer.js --network botTestnet
const { ethers, network } = require(`hardhat`);

const ARGS = process.argv.slice(2);
const ONCE = ARGS.includes(`--once`);
const vaultArg = ARGS.find((a) => a.startsWith(`--vault=`));
const VAULT = vaultArg ? vaultArg.split(`=`)[1] : process.env.VAULT_ADDRESS;
const WEBHOOK = process.env.WEBHOOK_URL || ``;
const FROM_BLOCK = Number(process.env.FROM_BLOCK || `0`);

function receipt(type, ev, extra) {
  return {
    type,
    vault: VAULT,
    network: network.name,
    chainId: network.config.chainId,
    txHash: ev.transactionHash,
    blockNumber: ev.blockNumber,
    ...extra,
  };
}

async function post(r) {
  console.log(JSON.stringify(r));
  if (!WEBHOOK) return;
  try {
    const res = await fetch(WEBHOOK, {
      method: `POST`,
      headers: { "content-type": `application/json` },
      body: JSON.stringify(r),
    });
    if (!res.ok) console.error(`webhook ${res.status} for ${r.txHash}`);
  } catch (e) {
    console.error(`webhook failed for ${r.txHash}:`, e.message || e);
  }
}

async function main() {
  if (!VAULT) throw new Error(`Set VAULT_ADDRESS env or --vault=0x...`);
  const vault = await ethers.getContractAt(`AgentVault`, VAULT);

  const handlers = {
    Executed: (a) => receipt(`Executed`, a, { agent: a.args.agent, token: a.args.token, target: a.args.target, amount: a.args.amount.toString() }),
    Withdrawn: (a) => receipt(`Withdrawn`, a, { token: a.args.token, amount: a.args.amount.toString() }),
    AgentSet: (a) => receipt(`AgentSet`, a, { agent: a.args.agent, allowed: a.args.allowed }),
    TargetSet: (a) => receipt(`TargetSet`, a, { target: a.args.target, allowed: a.args.allowed }),
    LimitSet: (a) => receipt(`LimitSet`, a, { agent: a.args.agent, token: a.args.token, amount: a.args.amount.toString() }),
    PerTxLimitSet: (a) => receipt(`PerTxLimitSet`, a, { agent: a.args.agent, token: a.args.token, amount: a.args.amount.toString() }),
    PausedSet: (a) => receipt(`PausedSet`, a, { paused: a.args.paused }),
    BundleCreated: (a) => receipt(`BundleCreated`, a, { bundleId: a.args.bundleId, name: a.args.name }),
    BundleTargetAdded: (a) => receipt(`BundleTargetAdded`, a, { bundleId: a.args.bundleId, target: a.args.target }),
    BundleTargetRemoved: (a) => receipt(`BundleTargetRemoved`, a, { bundleId: a.args.bundleId, target: a.args.target }),
  };

  if (ONCE) {
    for (const [name, fn] of Object.entries(handlers)) {
      const events = await vault.queryFilter(vault.filters[name](), FROM_BLOCK);
      for (const e of events) await post(fn(e));
    }
    console.log(`relayer done: replayed from block ${FROM_BLOCK}`);
    return;
  }

  console.log(`relayer watching ${VAULT} on ${network.name} (ctrl-c to stop)${WEBHOOK ? ` -> ${WEBHOOK}` : ` (stdout only)`}`);
  for (const [name, fn] of Object.entries(handlers)) {
    vault.on(name, (...args) => {
      const e = args[args.length - 1];
      post(fn(e));
    });
  }
  await new Promise(() => {}); // run until killed
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
