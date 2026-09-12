# @agentvault/sdk

Minimal SDK for AgentVault policy-gated spending vaults on BOT Chain.

## Three-line quickstart

```js
const { ethers } = require(`ethers`);
const { VaultSDK } = require(`@agentvault/sdk`);

const vault = new VaultSDK(agentSigner, VAULT_ADDRESS);
await vault.spend(ethers.ZeroAddress, VENDOR, ethers.parseEther(`0.1`));
```

`spend()` dry-runs via `wouldExecute` first and throws a human-readable
error (`OverLimit`, `TargetDenied`, …) instead of burning gas on a certain revert.

## Reads

- `wouldSpend(agent, token, target, amount)` → `{ ok, reason, human }`
- `daySpent(agent, token)`, `dailyLimit(agent, token)`
- `isTargetAllowed(target)` (direct allowlist OR any bundle)
- `getBundleTargets(bundleId)`, `isOwnerMultisig()`

## Owner writes (use an owner signer)

`setAgent`, `setTarget`, `setDailyLimit`, `setPerTxLimit`, `setCooldown`,
`setPaused`, `createBundle`, `addTargetToBundle`, `removeTargetFromBundle`,
`ownerWithdraw`.

## LLM-agent adapter

```js
const { vaultSpendTool } = require(`@agentvault/sdk/langchain`);
const tool = vaultSpendTool(sdk, { agentAddress });
// LangChain: new DynamicStructuredTool(tool)
// OpenAI function calling: require(`@agentvault/sdk/langchain`).openAIFunctionSpec
```
