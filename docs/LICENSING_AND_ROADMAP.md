# Looke reuse, licensing and launch gates

## Upstream permission

The Zora Protocol **repository root** has an MIT license (copyright 2023 Zora Labs).
Looke currently vendors only `packages/coins-sdk/src/metadata/validateMetadataJSON.ts`, from the
MIT-licensed `@zoralabs/coins-sdk` package. The original source and Zora MIT notice are retained
under `vendor/zora/`. The copied source is in a separate directory for future audits.

**Do not vendor the current Zora Coins contracts** (including `BaseCoin.sol`,
`ContentCoin.sol`, `CreatorCoin.sol`, and `ZoraFactoryImpl.sol`) without confirming
permission: those source files use `ZORA-DELAYED-OSL-v1`, which restricts competitive
and commercial uses until the applicable open date. The root MIT license does not override
those source-file restrictions. Looke's `LookeCoin` and `LookeCoinFactory` are independent
contracts, not modified versions of those restricted implementations.

Upstream: https://github.com/ourzora/zora-protocol
License details: https://github.com/ourzora/zora-protocol/blob/main/packages/coins/LICENSE

## Final Ultra EVM-only network decision (5 November 2026)

- **ACTIVE Ultra EVM Testnet (18881):** EVM wallets, creator coins, social, and future liquidity.
- **Ultra EVM Mainnet (19991):** configuration and read-only checks only; no mainnet signing, deployments or transactions authorized.
- Base, BNB and Ultra Native are excluded from the initial Looke Social product. Legacy source files and old audit reports remain for historical reproducibility, not as active wallet options. Future EVM NFTs require new audited ERC-721 contracts.
- Social profiles, moderation, messaging and discovery need their own backend/indexer.
- Zora SDK endpoints and Zora's deployed contract addresses MUST NOT be treated as Ultra deployments.

## Verified statuses at creation

- Original Next.js frontend, wallet connection, draft validation and factory call code are provided in this branch.
- Independent, non-audited Solidity contracts and Foundry tests are provided. No production audit is claimed.
- **No factory address is configured** by default. Testnet create transactions are gated until an actual verified deployment address is set.
- No creator coin liquidity, swaps, candlesticks, prices or real trading are included.
- No native Uniq minting, NFT marketplace trades or on-chain social messaging are included.
- No production site, Vercel deployment or mainnet contract is asserted.

## Next steps

1. Run npm tests, frontend build and `forge test` in CI.
2. Deploy and verify the factory on **Ultra EVM Testnet**; record the network, deployer, contract address and transaction hash.
3. Set `NEXT_PUBLIC_LOOKE_FACTORY_ADDRESS` to the verified Ultra EVM Testnet factory. Test coin creation with two wallets and independently verify the receipt.
4. If NFTs are added later, implement a reviewed Ultra EVM ERC-721 path, with chain-specific wallet approval and independent deployment evidence.
5. Add event-indexed creator coin discovery and security review before any trade/liquidity release.
6. Build original social feed and messaging backend; do not fabricate activity.
