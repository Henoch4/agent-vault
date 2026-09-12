# AgentVault - AI Allowance Vault for BOT Chain

Project 1 of 3 - narrative flagship for BOT Chain AI native thesis.
On chain policy engine: owner sets agents, allowlisted targets, per token daily limits.
Agents spend inside policy with no extra signatures.

## Networks
- Testnet - chainId 968 - RPC https://rpc.bohr.life - explorer https://scan.bohr.life
- Mainnet - chainId 677 - RPC https://rpc.botchain.ai - explorer https://scan.botchain.ai

## Deployments
- Testnet (968): `0xB9A5a2b1CF92186364080264acf64cd5C5270685` ([explorer](https://scan.bohr.life/address/0xB9A5a2b1CF92186364080264acf64cd5C5270685#code))
- Mainnet (677): `0xA27963D86F6805ED72591d59c58fed96F4fd9c81` ([explorer](https://scan.botchain.ai/address/0xA27963D86F6805ED72591d59c58fed96F4fd9c81#code))
- Both verified, same PolicyEngine-based bytecode. Owner on both: `0xCeA3A19feb565bee69e505112d405b1a1f31F230` (EOA — move to multisig per `docs/THREAT_MODEL.md` T5).

## Commands
- npm install
- npx hardhat test - full suite, 19 tests (core + bundles + invariants fuzz + SDK)
- npx hardhat run scripts/deploy.js --network botTestnet
- npx hardhat run scripts/deploy.js --network botMainnet
- `VAULT_ADDRESS=0x... npx hardhat run scripts/demo-agent.js --network botTestnet` - live demo loop
- `VAULT_ADDRESS=0x... npx hardhat run scripts/relayer.js --network botTestnet -- --once` - receipt replay

## Post deploy
1. Verify contract on scan.botchain.ai via Contract Verification page
2. Fund vault with BOT plus ERC20s like USDT 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C
3. Call setAgent plus setTarget plus setDailyLimit from owner wallet
4. Point frontend at deployed address plus explorer link

## Design notes
- Native BOT uses token address 0x0 inside execute and limits
- Day buckets use block.timestamp divided by 1 days
- OpenZeppelin `ReentrancyGuard` + `SafeERC20`, custom errors only, solc 0.8.20 for max EVM compat
- Policy logic lives in shared base `contracts/policy/PolicyEngine.sol` (agents, targets, bundles, limits, cooldown, pause, timelocked rotation) — audit once, reuse across AgentVault / MicroPredict / BotLaunch
- `sdk/` holds `@agentvault/sdk` (dry-run-first `spend()`) + LangChain/OpenAI tool adapter
