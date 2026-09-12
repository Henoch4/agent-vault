# AgentVault — Threat Model

This document maps each on-chain guardrail to the concrete failure mode it
contains. It is written for agent operators who need to answer: *"what happens
when something goes wrong?"*

## Assumptions

- The vault contract code is correct (audited primitive; tests + invariants in
  `test/`).
- The owner key is held securely (ideally a multisig — see T5).
- Agent keys live in hot, automated environments and **will** eventually leak or
  misbehave. The vault is designed so that a compromised agent key is a
  contained incident, not a total loss.

## Failure modes

### T1 — Agent is prompt-injected into sending funds to an attacker

*Scenario:* a malicious instruction in a webpage, doc, or tool output convinces
the LLM agent to pay an attacker-controlled address.

*Contained by:* **destination allowlist** (`targets` + bundles).
`execute()` reverts `TargetDenied` for any address that is not explicitly
allowlisted. The attacker cannot receive funds unless the owner previously
allowlisted them — at which point the failure is owner misconfiguration, not
agent misbehavior.

*Residual risk:* an injected prompt can still move funds **between allowlisted
destinations** (e.g. overpay a real vendor). Mitigate with tight per-tx caps
and daily limits.

### T2 — Agent private key leaks (repo, logs, compromised host)

*Scenario:* anyone holding an agent key can call `execute()` directly, with no
LLM involved at all.

*Contained by:* **per-agent, per-token daily limit + per-tx cap + cooldown**.
The blast radius is bounded by `dailyLimit[agent][token]` per 24h window, and
the cooldown throttles drain speed, buying the owner time to react.

*Response playbook:*
1. `setAgent(key, false)` — revokes that key instantly, other agents unaffected.
2. `setPaused(true)` — freezes all spending if the scope of compromise is unclear.
3. Rotate to a fresh agent key, restore limits, unpause.

### T3 — LLM hallucinates a destination address

*Scenario:* the model invents a plausible-but-wrong vendor address (wrong
checksum variant, off-by-one character, entirely fabricated).

*Contained by:* **destination allowlist**. A hallucinated address is not
allowlisted, so `execute()` reverts `TargetDenied`. The SDK's `spend()` and the
`wouldExecute` dry-run surface this *before* gas is spent, returning
`BLOCKED: destination is not allowlisted` as plain text the agent can reason
about and self-correct.

### T4 — Agent goes into a spend loop (bug, runaway retry, griefing)

*Scenario:* a software bug or adversarial tool response causes the agent to call
`execute()` thousands of times.

*Contained by:* **daily limit + per-tx cap + cooldown**, in that order.
Even an infinite loop cannot move more than the daily limit per day, cannot
move more than the per-tx cap per call, and the cooldown forces a minimum
interval between calls — converting an instant drain into a slow, observable,
revocable trickle. All attempts emit events the relayer (`scripts/relayer.js`)
forwards as receipts/webhooks.

### T5 — Owner key is compromised or acts maliciously

*Scenario:* the single most powerful key in the system is the owner:
`ownerWithdraw` moves **any amount to anywhere, instantly**, bypassing every
agent guardrail by design (owner is the trust root, not a constrained spender).

*Contained by (partially):*
- **Timelocked rotation** — ownership transfer takes 2 days
  (`proposeOwner` → wait → `acceptOwner`), so a stolen owner key cannot be
  instantly laundered into an attacker-owned vault without a 2-day window in
  which the legitimate owner can `cancelOwnerRotation`.
- **Operational rule: the owner MUST be a multisig** (Safe). The frontend and
  SDK expose `isOwnerContract()` so UIs can display "multisig-protected" vs
  "single-EOA owner — higher risk". A single-EOA owner remains a single point
  of failure; no contract code can fix that, only key management can.

*Not contained:* a live, malicious-or-coerced owner (or a compromised multisig
quorum) can always `ownerWithdraw` everything. If your threat model includes
the owner itself, use a timelocked multisig with independent signers.

### T6 — Malicious / fee-on-transfer / non-standard ERC20

*Scenario:* a token whose `transfer` lies about success, takes a fee, or
reverts unexpectedly.

*Contained by:* **SafeERC20** (`safeTransfer` reverts on failure or `false`
returns) plus `execute()` accounting that debits the *requested* amount. Note:
fee-on-transfer tokens can cause accounting drift (vault debits `amount` but
the target receives less). **Do not allowlist fee-on-transfer tokens** unless
you accept that property.

### T7 — Reentrancy via malicious token or target contract

*Scenario:* `execute()` calls an untrusted token/target; a malicious callee
re-enters `execute()` or `ownerWithdraw()` mid-flight.

*Contained by:* **OpenZeppelin `ReentrancyGuard`** (`nonReentrant` on both
`execute` and `ownerWithdraw`) plus checks-effects-interactions ordering
(limits debited and `lastExec` stamped *before* the external call). Native-BOT
sends use low-level `call` with empty calldata only (`BadCalldata` rejects
anything else), so no arbitrary code path is reachable through the vault.

### T8 — Front-running / MEV on agent spends

*Scenario:* an attacker sees an agent's `execute()` in the mempool and races it.

*Impact assessment:* low. There is no price, auction, or ordering-sensitive
logic in the vault — a spend either passes policy or reverts. The worst case is
a griefing copy of an already-valid spend, which itself must pass the same
agent/target/limit checks and only accelerates limit exhaustion (observable via
receipts). No fix required beyond monitoring.

## What the vault does NOT cover

- **Correctness of the agent's decisions** — paying the *wrong allowlisted*
  vendor the *right amount* is in-policy and will succeed. Human/vendor
  verification stays off-chain.
- **Privacy** — agents, targets, limits, and amounts are public on-chain.
- **Liveness** — a paused vault or an owner that never responds stays frozen.
  The timelock cuts both ways: rotation out of a dead owner key takes 2 days.

## Invariant (machine-checked)

`test/invariants.test.js` fuzzes randomized action sequences and asserts the
core property after every step:

> **No caller outside (`agents` ∧ (direct allowlist ∨ bundle membership) ∧
> daily limit ∧ per-tx cap ∧ cooldown ∧ unpaused) can ever move funds.**

See `test/invariants.test.js` for the harness.
