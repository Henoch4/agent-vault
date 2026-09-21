# 🚀 AgentVault Officially Launched on BOT Chain Mainnet

**Officially launched on BOT Chain Mainnet.**

Today we're announcing the mainnet deployment of AgentVault — a policy-gated spending vault that gives agents safe, controlled autonomy on-chain.

## What is AgentVault?

AgentVault is an on-chain policy engine that lets autonomous agents spend BOT tokens within strict rules: allowlisted destinations, hard daily limits, per-transaction caps, and enforced cooldowns. The owner stays in control — agents can never go rogue with funds they're not authorized to spend.

All policy logic lives in the shared `PolicyEngine` base contract (audited, reusable across all BOT Chain flagship apps). AgentVault is just the fund-movement layer on top.

## 🔗 Mainnet Details

| Detail | Value |
|--------|-------|
| **Network** | BOT Chain Mainnet (Chain ID 677) |
| **Contract** | `0xA27963D86F6805ED72591d59c58fed96F4fd9c81` |
| **Owner** | Safe multisig (`0x3f6599D5694044Ac0B357695843391220a5aE0c3`) |
| **Policy** | Agents, targets, bundles, limits, cooldown — all enforced on-chain |
| **Explorer** | [BOTScan](https://scan.botchain.ai) |
| **SDK** | [agentvaultbotchain](https://www.npmjs.com/package/agentvaultbotchain) |

## Key Features

- **Dry-run-first spending** — `wouldSpend()` checks policy before any gas is burned
- **Human-readable errors** — `OverLimit`, `TargetDenied`, `CooldownActive` — agents know exactly why they were blocked
- **Allowlist bundles** — O(1) membership checks for grouped destinations
- **Timelocked ownership rotation** — 2-day delay prevents accidental lockouts
- **Event relayer** — JSON receipts + webhook notifications for off-chain indexing

## The Numbers

- 📜 **4 contracts** deployed and verified on mainnet
- 🔒 **Reentrancy-guarded**, Safe ERC20 transfers, pause/emergency controls
- 🔄 **Owner transferred** to Safe multisig (2-of-2)

## Try It

```js
const { VaultSDK } = require('agentvaultbotchain');
const vault = new VaultSDK(agentSigner, VAULT_ADDRESS);
const check = await vault.wouldSpend(agent, token, target, amount);
// { ok: true, reason: 'OK', human: 'within policy' }
await vault.spend(token, target, amount);
```

## What's Next

- [ ] SDK npm publishing (`npm publish agentvaultbotchain`)
- [ ] Third-party audit
- [ ] Grant applications under review
- [ ] Community onboarding

## Links

- 📄 Whitepaper: [PDF](docs/whitepaper.pdf)
- 🔒 Threat Model: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)
- 📊 BOTScan: [AgentVault Contract](https://scan.botchain.ai/address/0xA27963D86F6805ED72591d59c58fed96F4fd9c81)
- 🏗️ GitHub: [agent-vault](https://github.com/Henoch4/agent-vault)

---

**Officially launched on BOT Chain Mainnet.**

AgentVault. Your agents spend. You stay in control.
