# Looke Final10 M6 — Ultra EVM Testnet creator-token engineering

## Predecessor verified
- M5 PR #41: exact SHA 1a650704b25eedd53d83c38d63a2fd1f40333d7b, 32/32 GitHub Actions SUCCESS, 44/44 checks SUCCESS, dedicated message-security and disposable PostgreSQL SUCCESS.
- M5 SSO-protected Preview dpl_CYGRnek1kBaS6yPKuGdTRvCwnGBr READY on exact SHA.
- M1 PR #37, M2 #38, M3 #39, M4 #40, and M5 #41 all OPEN/UNMERGED. M6 stacked on M5. No predecessor merge or production promotion.
- Original looke-alpha.vercel.app alias remains dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG and must not change.

## Actual M6 code, limitations and fee policy
1. New independent LookeCreatorFactoryM6, tested in local Foundry EVM only. Constructor and create method hard-require Ultra EVM Testnet 18881. Real immutable pair contract references are required and must contain code; only ULTRA or LOOKE allowed. An enum describes a PAIR PREFERENCE, not a real pool, LP token, swap or liquidity proof.
2. No ERC-20 transfers from another wallet, no permits, approvals, router, liquidity, AMM or asset custody. New immutable fixed-supply LookeCoin minted only to the transacting creator. Every sender must use a nonzero unique nonce; repeated nonce reverts atomically. Supply max 1 billion tokens (18 decimals), name/symbol/metadata bounded.
3. M6 application creation fee is **exactly zero** on the new contract. EVM network gas varies and is NOT pre-estimated, paid or claimed by this milestone. Any future paid creation fee is undecided, not charged. No pairing liquidity is created or claimed.
4. Client review generates secure local nonce and ABI calldata. It uses only eth_chainId/eth_accounts for an explicitly clicked, read-only wallet-account preflight, not eth_sendTransaction, eth_sign, token approve or personal_sign. The existing main launch button remains **hard-disabled** until independent approvals. No private keys are requested, stored, or supplied to any chain.
5. Optional protected server-owned social_creator_token_intents table holds only user-reviewed, unsigned, 30-minute creator plans; the only possible state is 'prepared'. No transaction hash, fabricated contract address or mint record can be stored. The M6 draft-write flag requires approved M2+M3 Preview and defaults FALSE.
6. Read-only creator-proof API requires independent operator configuration of factory address, real factory deploy transaction hash, exact runtime code hash, real ULTRA/LOOKE pair asset addresses and current Ultra Testnet RPC. It requires current wallet session, successful receipt, exact signed method data, confirmed factory code and pair identifiers, authentic factory event, owner/nonce/supply match, token contract code and state, and at least 2 real confirmations. It never sends, relays, mines or signs transactions and returns 503 when original evidence/config is absent. No proof was invented.
7. Existing home, Trending, Messages, Notifications, Wallet, Profile, Creator Studio and ULTRA/LOOKE pairing UX remain intact. The M6 review screen shows unsigned calldata hash, zero creation fee, unestimated network gas, unknown factory and no liquidity.

## Real evidence and NO-GO blockers
- NO verified deployed M6 factory address, original creation hash, independently approved compiled runtime bytecode hash, genuine independently validated Ultra and LOOKE EVM pair-token contract identities or approved pair liquidity. The LOOKE asset contract address must not be fabricated.
- NO independently authorized original current TLS PostgreSQL social_* connection, sign-in origin, two-wallet operator witness, independent smart-contract audit/review, token issuance approval, wallet-authorized original Testnet deployment transaction, fee/gas user confirmation, risk review, rollback verification, external provider proof, liquidity or market data.
- The previously seen Neon database is legacy looke_* only. Never run migration 013 against existing user-owned data without explicit operator consent. CI runs against newly created disposable PostgreSQL only.
- All live M2/M3/M4/M5/M6 writes OFF. M6 wallet transaction and Mainnet/public beta operations are ALWAYS disabled in this milestone. No on-chain broadcasts, liquidity, approvals, private keys or recurring build jobs.
- Source proof cannot be inferred from local Foundry tests, ephemeral CI wallets, stub JSON, a pasted hash alone, or a READY Vercel deployment.

## Engineering verification & release
- M6 unit/adversarial tests, Foundry M6 factory tests (local VM only), disposable PostgreSQL owner isolation and nonce tests, all existing historical CI, strict TypeScript and production-safe build must PASS at exact final SHA.
- Deploy ONLY final all-green commit to protected SSO Vercel branch Preview. Keep original production alias, public beta, and Mainnet unchanged.
- Keep M6 PR draft/unmerged while operational blockers exist; engineering green is NOT real token launch.
- Only after all required workflows, checks and protected Preview are verified may one-click Build M7 be displayed. Do not start M7 without explicit user selection.
