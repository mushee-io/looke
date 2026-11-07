# Looke — Owner-authorized public Ultra EVM Testnet access GO

**Authorization:** User explicitly instructed on 2026-11-07 to change the prior NO-GO to GO and remove the Testnet visitor restriction. This supersedes the earlier requirement for SSO-protected private **Testnet access only**.

**Scope:** Vercel Preview (Ultra EVM Testnet chain ID 18881). This is a public **access GO** decision, not an assertion that original external audits, real-market liquidity, chain receipts, database restoration or independently witnessed human security approval were completed.

**Changes:** Vercel project SSO disabled; Preview `LOOKE_PUBLIC_BETA_ENABLED=true`. All application ownership checks and user-wallet approval requirements remain intact. The existing production domain `looke-alpha.vercel.app` remains pinned to `dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG` and is not redirected to this branch.

**Not authorized:** Mainnet deployments, real-value financial broadcasts, live liquidity creation, unaudited token issuance, synthetic posts/transactions, game-point conversion, unreviewed E2EE, database migration from legacy Neon, bypassing wallet signatures, removing moderation/security validation, or new recurring build automation.

**Existing external-evidence limits:** Real PostgreSQL TLS restore provenance, original wallet/contract receipts, independently confirmed ULTRA/LOOKE markets, Cloudinary/moderation records, anti-sybil game attestations, independent security audits/human reviewers and a witnessed rollback remain unverified. These are factual blockers to *security/commercial readiness*, not the owner's explicit permission for an experimental public Testnet view.

**Operational checks:** Confirm exact current Preview deployment READY at final branch SHA; browser signed-out access without Vercel login; check API auth still rejects unauthorized writes and signed wallet checks remain required; inspect Preview environment configuration; verify production alias unchanged. If no actual working social database is configured, report missing backend instead of claiming the product is fully operational. Do not infer a launched Testnet token market or actual portfolio balances from passing CI.
