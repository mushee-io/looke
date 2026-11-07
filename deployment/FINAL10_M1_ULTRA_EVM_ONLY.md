# Final 10 Looke Social milestones — M1 Ultra EVM-only migration

## Product decision
All ACTIVE Looke Social functionality uses **Ultra EVM** only. Base, BNB and Ultra Native wallets/Uniqs are excluded from the initial product. This supersedes earlier multichain roadmaps; prior Git history and separately labeled historical engineering/evidence modules are preserved for audit.

- **Ultra EVM Testnet:** chain 18881 / 0x49c1, RPC https://evm.test.ultra.eosusa.io, explorer https://evmexplorer.testnet.ultra.io
- **Ultra EVM Mainnet:** chain 19991 / 0x4e17, RPC https://evm.ultra.eosusa.io, explorer https://evmexplorer.ultra.io
- Source: https://developers.ultra.io/tutorials/Ultra-EVM/Resources
- Only chain **18881** is active for wallet sign-in and potentially authorized Testnet operations. Mainnet is metadata and read-only RPC verification ONLY; no sign, deploy, swap, claim or mint from Looke.
- `src/lib/ultra-evm-wallet.ts` uses EIP-1193 account permission, requests wallet_switchEthereumChain, handles only 4902 by wallet_addEthereumChain, verifies the final real chain ID and checks the wallet is still authorized after switching. User rejection or ignored switching fails CLOSED.
- `/api/ultra-evm/health` is a protected Preview-only independent read-only RPC probe for both official EVM chains; a failed/misconfigured RPC reports unavailable, never fake blocks or chain IDs.
- Home, Discover, Social composer, profile, beta and live proof tabs no longer offer native Uniq or Base/BNB wallet/asset actions. Legacy `/uniqs` is a safe information page; `GET /api/uniqs` returns 410 without calling the native RPC. Historical native implementation is not an active application integration.
- Staging environment templates exclude native chain RPC and proof configuration. Historical development runbooks and original CI proof artifacts remain in Git history; do not reinterpret them as new EVM NFT, token or financial approvals.

## Ten milestones, exactly
1. **M1 / Ultra EVM-only migration**: canonical networks and Testnet-only wallet switch, native route shutdown, adversarial tests and protected Preview.
2. **M2 / Wallet profiles and @handles**: authenticated Ultra EVM session, one-time nonces, unique handle reservation in real PostgreSQL, cross-wallet security.
3. **M3 / Social feed and creator activity**: actual owner-scoped posts, feed, follows, likes, profiles, notifications backed by real authorized sources.
4. **M4 / Creator Studio and uploads**: safe moderated posts, token draft and hosted image/video, provider identity and content moderation evidence.
5. **M5 / Messaging and notifications**: secure account-scoped messaging design, spam/abuse controls and audited encryption before E2EE release.
6. **M6 / Ultra EVM creator coins**: verified contract deployment, creator/token receipt and reviewed wallet-approved Testnet issuance.
7. **M7 / Looke Pad and Markets**: genuine allowlisted liquidity, real swaps/candlesticks, trending, watchlist, and strict wallet risk gates.
8. **M8 / LOOKE token and Points**: one aggregate Ultra EVM token supply design, anti-sybil/vesting and transparent conversion; issuance remains disabled until independent approval.
9. **M9 / Complete integration/security**: genuine two-wallet tests, complete original source-backed PostgreSQL and provider records, independent audit and restore.
10. **M10 / Final protected acceptance**: real end-to-end operator and signed independent release evidence; production GO only after explicit human authorization, not because CI passed.

Stop milestone creation at M10. No recurring builder, no unauthorized writing or financial broadcasts.

## M1 acceptance and blockers
- Run `npm test`, `npm run test:final-m1`, `npm run typecheck`, `npm run build`, `forge test`, and all historical GitHub CI jobs.
- Protect existing Vercel Preview with SSO; accept ONLY the exact final green commit. No public beta or mainnet deployment.
- Preserve `looke-alpha.vercel.app` assigned to `dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG`; do not promote or reassign.
- Actual operational blockers persist: authorized current PostgreSQL (existing Neon only has legacy schema), original moderated Cloudinary media, original creator-coin receipts, signed human security/operator reviews, and independent restore.
- All production, public beta, social/media/Points writes, creator token issuance, liquidity and financial activity remain OFF and release decision NO_GO.

**Follow-up after M1 verification: one clickable Build Milestone 2 action. Do not start M2 automatically.**
