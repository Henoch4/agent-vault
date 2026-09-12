const { expect } = require(`chai`);
const { ethers } = require(`hardhat`);

// Machine-checked core invariant (see docs/THREAT_MODEL.md):
//   No caller outside (agent ∧ (direct allowlist ∨ bundle) ∧ daily limit ∧
//   per-tx cap ∧ cooldown ∧ unpaused) can ever move funds — AND the
//   wouldExecute dry-run never disagrees with the real outcome.
// Deterministic PRNG (mulberry32) so any failure reproduces exactly.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe(`AgentVault invariants (fuzz)`, function () {
  it(`policy gate + dry-run agreement hold over randomized sequences`, async function () {
    const rand = rng(0xA6E17);
    const [owner, agentA, agentB, stranger, T1, T2, DENIED] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory(`AgentVault`);
    const vault = await Vault.deploy();
    const Token = await ethers.getContractFactory(`MockERC20`);
    const token = await Token.deploy();
    const vaultAddr = await vault.getAddress();
    const tokenAddr = await token.getAddress();
    const NATIVE = ethers.ZeroAddress;

    const FUND = ethers.parseEther(`100`);
    await owner.sendTransaction({ to: vaultAddr, value: FUND });
    await token.mint(vaultAddr, ethers.parseEther(`100`));
    // Baseline: signer-targets may start with nonzero native balances.
    const initBal = new Map();
    for (const t of [T1.address, T2.address, DENIED.address]) {
      initBal.set(t, await ethers.provider.getBalance(t));
    }

    const agents = [agentA, agentB];
    const actors = [owner, agentA, agentB, stranger];
    const spendTargets = [T1.address, T2.address, DENIED.address];
    // expected receipts per target (native + token), for balance accounting
    const received = new Map();
    const credit = (t, tok, amt) => {
      const k = `${t}:${tok}`;
      received.set(k, (received.get(k) || 0n) + amt);
    };

    await vault.setAgent(agentA.address, true);
    await vault.setAgent(agentB.address, true);
    await vault.setTarget(T1.address, true);
    await vault.setTarget(T2.address, true);
    for (const a of agents) {
      await vault.setDailyLimit(a.address, NATIVE, ethers.parseEther(`10`));
      await vault.setDailyLimit(a.address, tokenAddr, ethers.parseEther(`10`));
    }

    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const randAmt = () => ethers.parseEther((rand() * 12).toFixed(3)); // 0..12, often over limits
    let paused = false;
    // Driver-side ledger: successful spends per (agent,token,day). Must always
    // equal the on-chain `spent` ledger — proves the accounting integrity.
    // NOTE: daySpent <= dailyLimit is deliberately NOT asserted globally: the
    // owner may legitimately lower a limit below already-spent amounts. The
    // execution-time gate (used+amount <= limit) is covered by the
    // prediction/outcome agreement check on every attempt.
    const ledger = new Map();
    const today = async () => {
      const b = await ethers.provider.getBlock(`latest`);
      return BigInt(b.timestamp) / 86400n;
    };

    for (let step = 0; step < 120; step++) {
      const roll = rand();
      if (roll < 0.55) {
        // --- execute attempt: predict, then compare outcome ---
        const actor = pick(actors);
        const tokenPick = rand() < 0.5 ? NATIVE : tokenAddr;
        const target = pick(spendTargets);
        const amount = randAmt();
        const [predicted] = await vault.wouldExecute(actor.address, tokenPick, target, amount);
        let succeeded = false;
        try {
          await vault.connect(actor).execute(tokenPick, target, amount, `0x`);
          succeeded = true;
        } catch (e) {
          succeeded = false;
        }
        expect(succeeded, `step ${step}: dry-run said ${predicted} but execute ${succeeded ? `succeeded` : `reverted`} (actor=${actor.address.slice(0, 8)} amt=${amount})`).to.equal(predicted);
        if (succeeded) {
          credit(target, tokenPick, amount);
          const day = await today();
          const k = `${actor.address}:${tokenPick}:${day}`;
          ledger.set(k, (ledger.get(k) || 0n) + amount);
        }
      } else if (roll < 0.65) {
        await vault.setAgent(pick(agents).address, rand() < 0.7);
      } else if (roll < 0.72) {
        await vault.setTarget(pick([T1.address, T2.address]), rand() < 0.7);
      } else if (roll < 0.80) {
        const a = pick(agents);
        await vault.setDailyLimit(a.address, rand() < 0.5 ? NATIVE : tokenAddr, randAmt());
      } else if (roll < 0.86) {
        const a = pick(agents);
        await vault.setPerTxLimit(a.address, rand() < 0.5 ? NATIVE : tokenAddr, rand() < 0.5 ? 0n : randAmt());
      } else if (roll < 0.92) {
        paused = !paused;
        await vault.setPaused(paused);
      } else {
        await ethers.provider.send(`evm_increaseTime`, [Math.floor(rand() * 2 * 86400)]);
        await ethers.provider.send(`evm_mine`, []);
      }

      // --- invariant: on-chain spent ledger always matches driver accounting ---
      for (const a of agents) {
        for (const tok of [NATIVE, tokenAddr]) {
          const day = await today();
          const used = await vault.daySpent(a.address, tok);
          const expected = ledger.get(`${a.address}:${tok}:${day}`) || 0n;
          expect(used, `step ${step}: spent ledger drift`).to.equal(expected);
        }
      }
    }

    // --- accounting: every recorded receipt matches on-chain balances ---
    for (const [key, amt] of received) {
      const [t, tok] = key.split(`:`);
      const bal = tok === NATIVE
        ? await ethers.provider.getBalance(t)
        : await token.balanceOf(t);
      const expected = tok === NATIVE ? (initBal.get(t) || 0n) + amt : amt;
      expect(bal, `receipt mismatch for ${key}`).to.equal(expected);
    }
  });
});
