# Final10 M6 — Ultra EVM Testnet creator-token foundations (NO live issuance)

## Verified M5 predecessor
- M1 PR #37, M2 PR #38, M3 PR #39, M4 PR #40 all remain OPEN/UNMERGED.
- M5 PR #41 head `1a650704b25eedd53d83c38d63a2fd1f40333d7b` OPEN/DRAFT/UNMERGED.
- 32/32 GitHub workflows SUCCESS, 44/44 checks SUCCESS, dedicated M5 message-security + disposable PostgreSQL SUCCESS, main contracts/web/social_db SUCCESS.
- M5 SSO-protected Vercel branch Preview `dpl_CYGRnek1kBaS6yPKuGdTRvCwnGBr` READY on exact SHA; `looke-alpha.vercel.app` stays pinned to `dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG`.

## What M6 does (engineering only)
- Adds `LookeM6CreatorFactory.sol` **candidate**, separate from legacy `LookeCoinFactory.sol`. This is **NOT** a deployed contract and is NOT permission to deploy. Existing fixed-supply ERC-20 `LookeCoin` is reused: no post-launch mint, tax, transfer restrictions or market maker.
- New candidate accepts **only ULTRA or LOOKE as a quote preference**, not actual pool contracts, asset pairing, swaps, liquidity or price discovery. No router interaction. No native UOS transfer accepted. Platform creation fee is hardcoded zero; gas is additional and can only be quoted to an explicitly approving wallet after real factory verification. Creator retains the entire initial fixed supply.
- One-use per-wallet factory nonce, strict name/ticker/supply/immutable IPFS/Arweave metadata restrictions, no approval/permit or owner withdrawal backdoor. Issuance emits `CreatorCoinCreated` only if a future separately authorized owner-submitted transaction succeeds. Solidity Foundry tests exercise an in-memory local EVM only; they are not Ultra Testnet deployment proofs.
- M6 server validates tokens up to 1 trillion human units, 18 decimals, with `metadataURI` restricted to canonical IPFS/Arweave. Server does not fetch, cache, pin or interpret remote content. `LOOKE_M6_CREATOR_PREVIEW_WRITES_ENABLED` (default false) requires M2 signed identity, M3 social and protected Preview only. It may write **unsigned review-only** per-wallet, per-nonce PostgreSQL metadata; there is no stored token address or claimed deployment status.
- New read-only factory/receipt verifier requires **real Ultra EVM Testnet chain 18881**, original creation transaction and contract address, bytecode matching an independently operator-approved pinned runtime hash, zero creation fee, >=2 confirmations, matching real wallet-submitted transaction calldata + factory logs, and independent deployed token bytecode, creator, supply, balance and metadata state. Without all real sources, proof API returns BLOCKED, not synthetic contracts or coins.
- `prepareM6WalletReview` verifies selected wallet is on exact Ultra EVM Testnet 18881 and builds **unsigned** calldata only after independent factory proof. It NEVER calls `eth_sendTransaction`, signs, estimates fake gas, accesses private keys, or broadcasts. Any future on-chain submission requires an **additional explicit wallet-approval click and operator security review** not authorized by M6.
- Existing wallet, profile, Discover homepage, Trending, social feed, messaging, token modal and Create screen are preserved. New UI fee and pairing disclosure is informational only; launch remains disabled.

## CI and source evidence
- Solidity `forge test` covers nonce replay, separate creator accounts, ticker/supply/immutable metadata rejection, full owner token supply and exact preference with zero fee and no liquidity.
- Unit adversarial tests cover network/account switches, invalid pairs, external metadata, supply bounds, wallet-call absence, mock original receipt and codehash provenance.
- Disposable PostgreSQL tests create independently signed ephemeral CI wallets and validate server-session ownership, nonce uniqueness, no-transaction preview, wrong origin, anonymous denial and proof NO-GO. **CI fixtures are never genuine user wallets, deployed contracts, funded token pairs or operator approvals.**
- M6 dedicated CI jobs, existing regression suite, exact final-head all-green GitHub Actions and Vercel protected Preview are required.

## Real source and operational blockers
A currently approved TLS PostgreSQL `social_*` database, exact authenticated HTTPS Preview origin, real deployed and audited M6 factory address + original Ultra EVM 18881 deployment tx, pinned deployed runtime bytecode hash and approved source, actual wallet owner transaction consent and receipt, reviewed ULTRA/LOOKE quote-token addresses, router/liquidity contracts and security controls, and independent human operator/security reviews are **NOT available**. The earlier Neon `looke_*` source is incompatible; do not migrate or overwrite it.

All M2-M5 operational source blockers remain. Leave all new and existing hosted write flags OFF. No Mainnet, public beta, private key handling, live issuance, liquidity, swaps, financial broadcasts, recurring builds, production alias reassignment, or synthetic market data.

## Review and continuation
Keep M6 a separate stacked DRAFT PR on exact approved M5 head; do not merge M1-M6 into main or deploy public beta. Engineering PASS only after **all checks and workflows** for exact final SHA plus SSO-protected Vercel Preview READY; do not claim operational Testnet GO. Only then offer a single clickable Build M7 action. No automatic M7 start.
