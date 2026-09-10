# AgentVault - AI Allowance Vault for BOT Chain

Project 1 of 3 - narrative flagship for BOT Chain AI native thesis.
On chain policy engine: owner sets agents, allowlisted targets, per token daily limits.
Agents spend inside policy with no extra signatures.

## Networks
- Testnet - chainId 968 - RPC https://rpc.bohr.life - explorer https://scan.bohr.life
- Mainnet - chainId 677 - RPC https://rpc.botchain.ai - explorer https://scan.botchain.ai

## Commands
- npm install
- npx hardhat test - full suite, 6 tests
- npx hardhat run scripts/deploy.js --network botTestnet
- npx hardhat run scripts/deploy.js --network botMainnet

## Post deploy
1. Verify contract on scan.botchain.ai via Contract Verification page
2. Fund vault with BOT plus ERC20s like USDT 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C
3. Call setAgent plus setTarget plus setDailyLimit from owner wallet
4. Point frontend at deployed address plus explorer link

## Design notes
- Native BOT uses token address 0x0 inside execute and limits
- Day buckets use block.timestamp divided by 1 days
- Reentrancy guard inline, custom errors only, solc 0.8.20 for max EVM compat
