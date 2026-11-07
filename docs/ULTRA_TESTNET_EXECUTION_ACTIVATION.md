# Ultra EVM Testnet — owner-authorized execution activation

Scope: Ultra EVM Testnet 18881, public Preview only. User expressly authorized enabling trading and creator token issuance after public Testnet GO.

## Changes

- Preview setting `LOOKE_M4_TRADING_ENABLED=true`. Existing `trading-server` activates execution **only after** at least one actual configured V2 pair passes RPC verification (distinct ERC20 base/quote, real pair, router, factory, two-sided reserves). Quotes expire after 25 seconds; approvals are exact, wallet-signed; slippage limits and receipt validation remain.
- Preview setting `LOOKE_SOCIAL_WRITES_ENABLED=true` for authenticated participation. This does not provision a PostgreSQL database, relax wallet ownership or permit fabricated posts.
- Creator Studio now enables a **standalone** factory `createCoin` wallet transaction on Testnet 18881 only, after original contract-creation receipt, factory bytecode, coinCount and 2+ confirmations verify. After user approval, the emitted CoinCreated receipt, creator/supply/metadata and deployed coin state are verified. This does not create a pool or mint an existing LOOKE ecosystem token.
- Public Testnet access remains on; no changes to the `looke-alpha.vercel.app` production alias.

## Operational prerequisites still missing

1. `NEXT_PUBLIC_LOOKE_FACTORY_ADDRESS` + `NEXT_PUBLIC_LOOKE_FACTORY_DEPLOY_TX` from a genuine 18881 creation transaction. Never invent or deploy a factory with an unauthorized signing key.
2. `LOOKE_M4_MARKETS_JSON`: independently verified real 18881 V2 pool/router/factory/token addresses, and actual funded reserves. Empty `[]` means no real executable market; toggling execution does NOT create liquidity.
3. A genuine current TLS `DATABASE_URL` with required `social_*` schema and an approved moderator/media provider for live social features. No legacy Neon migrations.
4. An end user's wallet connected to chain 18881, with its own explicit transaction approval and sufficient Testnet gas/tokens.

A deployed UI is not proof of real contract addresses, pool liquidity, user records, or successful issuance. Mainnet, self-directed financial broadcasts, private keys, synthetic market activity, public claims of external audits, unauthorized E2EE, and points conversions remain excluded.
