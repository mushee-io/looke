# Official LOOKE — 100,000,000 ERC-20 Ultra EVM Testnet Deployment

The official LOOKE ecosystem token is intentionally **separate** from the creator-coin factory. This is an Ultra EVM Testnet deployment flow on chain ID **18881**. There is no production/Mainnet launch in this work.

## Token guarantees

- Name **Looke**; symbol **LOOKE**; 18 decimals
- Fixed and immutable total supply **100,000,000 LOOKE** = **100000000000000000000000000** base units
- Entire original supply allocated only at deployment to the selected initial treasury, currently constrained by the app to the **connected wallet**
- No post-deployment mint, admin owner, upgradeability, tax, pausing or blacklist
- Conventional ERC-20 transfer/transferFrom/allowance/approve; additional allowance adjustment methods, no arbitrary deductions
- Token contract: `contracts/LookeEcosystemToken.sol`. Not `contracts/LookeCoin.sol` or `contracts/LookeCoinFactory.sol`

## Build and Test

Review the exact source, then run from the Looke repo:

```bash
forge build
forge test --match-contract LookeEcosystemTokenTest -vv
npm run typecheck
npm test
npm run build
```

Foundry settings in `foundry.toml`: Solidity 0.8.24, optimizer enabled, 200 runs.

## Wallet-approved Testnet deployment

1. In `/setup/looke` on the exact deployed authenticated/protected branch preview, connect an EVM wallet set to chain 18881, with sufficient **Testnet UOS for gas**. No private key is ever requested.
2. Compile the reviewed source locally. In the browser select `out/LookeEcosystemToken.sol/LookeEcosystemToken.json`. The compiled artifact remains local; the page checks its ABI and constructor layout. **These checks do not themselves prove that uploaded bytecode matches trusted source.** Compare the compiler output to the audited source/version before signing.
3. Initial treasury must equal the currently connected Testnet wallet, receiving all 100M at deployment. Review the explicit checkbox, token terms and wallet transaction gas/chain/bytecode before approval.
4. User signs **one** transaction using `eth_sendTransaction`. Nothing is sent by CI, by a server, or automatically. The page waits for two confirmations and crosschecks original contract-creation receipt, transaction input equals the selected compiled creation bytecode plus encoded treasury constructor, runtime bytecode, ERC-20 name/ticker/decimals/supply, original Transfer from zero to wallet for exactly 100M, and original treasury balance at creation.
5. Record immutable **deployment contract address**, **transaction hash**, deployer and chain ID from the explorer `https://evmexplorer.testnet.ultra.io`. Share the PUBLIC contract address and tx hash (never keys) for independent verification. Do not deploy multiple official tokens merely because a UI times out; check the explorer first.
6. Later, if genuinely deploying a market, use `/setup` to verify chain provenance and funded two-sided V2 pools. Creator-token pairing is separate from this token deployment.

## Important

This is an **official Testnet experimental token**, not a promise of sale, value, price, vesting, airdrop, liquidity, investor returns or Mainnet issuance. Any allocation policy, rewards or migrations require separately approved governance and contract designs. Current logic allocates 100% to the deployment wallet. If a multisig treasury is preferred, explicitly change and retest recipient controls **before** deployment.

Even after successful on-chain creation, the release team should perform independent runtime bytecode/source review, event audit, original supply verification, and transaction/ownership review before claiming independently audited or Mainnet ready. Preview access and passing unit tests alone are not proof of a verified token on-chain.
