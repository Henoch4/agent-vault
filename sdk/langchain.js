// LangChain / OpenAI-function-calling adapter for @agentvault/sdk.
// Framework-light: returns a plain tool object that plugs straight into
// LangChain's DynamicStructuredTool, and a raw OpenAI function spec.
//
//   const { vaultSpendTool, openAIFunctionSpec } = require("@agentvault/sdk/langchain");
//   const tool = vaultSpendTool(sdk, { agentAddress, defaultToken });
//   const lcTool = new DynamicStructuredTool(tool); // @langchain/core/tools

function vaultSpendTool(sdk, { agentAddress, defaultToken = `0x0000000000000000000000000000000000000000` } = {}) {
  if (!sdk) throw new Error(`vaultSpendTool: sdk required`);
  if (!agentAddress) throw new Error(`vaultSpendTool: agentAddress required`);
  return {
    name: `vault_spend`,
    description:
      `Spend funds from an AgentVault policy-gated vault. ` +
      `The spend ONLY succeeds if: the caller key is an authorized agent, ` +
      `the destination is allowlisted (directly or via a bundle), and the amount ` +
      `fits the per-transaction cap and remaining daily limit. ` +
      `Always dry-runs first; a blocked spend returns the human-readable policy ` +
      `reason instead of reverting on-chain. Amounts are in wei as decimal strings. ` +
      `Use the zero address for native BOT.`,
    schema: {
      type: `object`,
      properties: {
        token: { type: `string`, description: `ERC20 token address, or 0x0000...0000 for native BOT` },
        target: { type: `string`, description: `Destination address (must be allowlisted)` },
        amountWei: { type: `string`, description: `Amount in wei as a decimal string, e.g. "100000000000000000"` },
      },
      required: [`target`, `amountWei`],
    },
    func: async ({ token, target, amountWei }) => {
      const t = token || defaultToken;
      try {
        const check = await sdk.wouldSpend(agentAddress, t, target, amountWei);
        if (!check.ok) return `BLOCKED: ${check.human} (${check.reason})`;
        const tx = await sdk.spend(t, target, amountWei);
        const rc = await tx.wait();
        return `SENT: ${amountWei} wei of ${t} to ${target} in ${rc.hash}`;
      } catch (e) {
        return `ERROR: ${e.shortMessage || e.message}`;
      }
    },
  };
}

const openAIFunctionSpec = {
  name: `vault_spend`,
  description: `Spend funds from an AgentVault policy-gated vault. Enforces agent authorization, destination allowlist, per-tx cap, daily limit, and cooldown. Dry-runs before sending.`,
  parameters: {
    type: `object`,
    properties: {
      token: { type: `string`, description: `ERC20 token address, or 0x0000...0000 for native BOT` },
      target: { type: `string`, description: `Destination address (must be allowlisted)` },
      amountWei: { type: `string`, description: `Amount in wei as a decimal string` },
    },
    required: [`target`, `amountWei`],
    additionalProperties: false,
  },
};

module.exports = { vaultSpendTool, openAIFunctionSpec };
