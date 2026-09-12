// @agentvault/sdk — minimal wrapper around the AgentVault policy engine.
// Three lines to give an agent safe spending power:
//   const { VaultSDK } = require("@agentvault/sdk");
//   const vault = new VaultSDK(agentSigner, VAULT_ADDRESS);
//   await vault.spend(ethers.ZeroAddress, VENDOR, ethers.parseEther("0.1"));
const { Contract } = require(`ethers`);

const NATIVE = `0x0000000000000000000000000000000000000000`;
const EMPTY_DATA = `0x`;

const VAULT_ABI = [
  `function owner() view returns (address)`,
  `function pendingOwner() view returns (address)`,
  `function paused() view returns (bool)`,
  `function agents(address) view returns (bool)`,
  `function targets(address) view returns (bool)`,
  `function dailyLimit(address,address) view returns (uint256)`,
  `function perTxLimit(address,address) view returns (uint256)`,
  `function execCooldown() view returns (uint256)`,
  `function lastExec(address) view returns (uint256)`,
  `function daySpent(address,address) view returns (uint256)`,
  `function isOwnerContract() view returns (bool)`,
  `function isTargetAllowed(address) view returns (bool)`,
  `function getBundleTargets(bytes32) view returns (address[])`,
  `function wouldExecute(address,address,address,uint256) view returns (bool,string)`,
  `function execute(address,address,uint256,bytes)`,
  `function setAgent(address,bool)`,
  `function setTarget(address,bool)`,
  `function setDailyLimit(address,address,uint256)`,
  `function setPerTxLimit(address,address,uint256)`,
  `function setExecCooldown(uint256)`,
  `function setPaused(bool)`,
  `function createBundle(bytes32,string,address[])`,
  `function addTargetToBundle(bytes32,address)`,
  `function removeTargetFromBundle(bytes32,address)`,
  `function ownerWithdraw(address,uint256,address)`,
];

const HUMAN_REASONS = {
  Paused: `vault is paused by the owner`,
  NotAgent: `signer is not an authorized agent on this vault`,
  TargetDenied: `destination is not allowlisted (directly or via any bundle)`,
  OverLimit: `amount exceeds the agent's remaining daily limit`,
  OverPerTx: `amount exceeds the per-transaction cap`,
  CooldownActive: `cooldown window has not elapsed since the last spend`,
  OK: `within policy`,
};

class VaultSDK {
  constructor(signerOrProvider, vaultAddress) {
    if (!vaultAddress) throw new Error(`VaultSDK: vaultAddress required`);
    this.address = vaultAddress;
    this.vault = new Contract(vaultAddress, VAULT_ABI, signerOrProvider);
  }

  // ---- reads ----
  owner() { return this.vault.owner(); }
  paused() { return this.vault.paused(); }
  isAgent(a) { return this.vault.agents(a); }
  isTargetAllowed(t) { return this.vault.isTargetAllowed(t); }
  daySpent(agent, token = NATIVE) { return this.vault.daySpent(agent, token); }
  dailyLimit(agent, token = NATIVE) { return this.vault.dailyLimit(agent, token); }
  isOwnerMultisig() { return this.vault.isOwnerContract(); }
  getBundleTargets(id) { return this.vault.getBundleTargets(id); }

  /** Dry-run: returns { ok, reason, human } without spending gas on state. */
  async wouldSpend(agent, token, target, amount) {
    const [ok, reason] = await this.vault.wouldExecute(agent, token, target, amount);
    return { ok, reason, human: HUMAN_REASONS[reason] || reason };
  }

  /**
   * Agent spend. Dry-runs first and throws a human-readable error instead of
   * burning gas on a certain revert. Pass an agent-authorized signer.
   */
  async spend(token, target, amount) {
    const signerAddr = await this.vault.runner.getAddress();
    const check = await this.wouldSpend(signerAddr, token, target, amount);
    if (!check.ok) {
      const err = new Error(`VaultSDK.spend blocked: ${check.human} (${check.reason})`);
      err.code = check.reason;
      throw err;
    }
    return this.vault.execute(token, target, amount, EMPTY_DATA);
  }

  // ---- owner writes (call with an owner signer) ----
  setAgent(agent, allowed) { return this.vault.setAgent(agent, allowed); }
  setTarget(target, allowed) { return this.vault.setTarget(target, allowed); }
  setDailyLimit(agent, token, amount) { return this.vault.setDailyLimit(agent, token, amount); }
  setPerTxLimit(agent, token, amount) { return this.vault.setPerTxLimit(agent, token, amount); }
  setCooldown(seconds) { return this.vault.setExecCooldown(seconds); }
  setPaused(p) { return this.vault.setPaused(p); }
  createBundle(id, name, targets) { return this.vault.createBundle(id, name, targets); }
  addTargetToBundle(id, target) { return this.vault.addTargetToBundle(id, target); }
  removeTargetFromBundle(id, target) { return this.vault.removeTargetFromBundle(id, target); }
  ownerWithdraw(token, amount, to) { return this.vault.ownerWithdraw(token, amount, to); }
}

module.exports = { VaultSDK, VAULT_ABI, NATIVE, EMPTY_DATA, HUMAN_REASONS };
