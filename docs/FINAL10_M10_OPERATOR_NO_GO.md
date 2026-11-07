# Final10 M10 — final engineering evidence and operator NO-GO package

**Scope:** Ultra EVM Testnet (chain 18881). Draft branch stacked directly on M9 PR #46 at `fa549919b24da2daddaa79983552daca201b807e`. No merge, production alias change, Mainnet transaction, public beta, legacy Neon migration, Points conversion or recurring build is authorized by this document.

## Proven predecessor baseline (2026-11-07)
- M9 PR #46 is draft/open/unmerged at exact requested SHA. GitHub workflow API returned 36 completed successful pull-request workflows including `Final10 M9 independent acceptance and non-mutating restore readiness`.
- Dedicated M9 jobs `security-and-release-gates`, `actual-disposable-postgres-and-restore-diff`, and `solidity-regression` were successful. CI databases are disposable fixtures, **not an original backup restored under TLS**.
- M9 Vercel Preview `dpl_FeGCEegVxYenPxADuU4WkQhwMdQS` READY at exact SHA; independent signed-out SSO HTTP denial remains a separate required operator check.
- Production `looke-alpha.vercel.app` control-plane lookup returned `dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG`; no alias changes authorized.
- Predecessor PRs #37 #38 #39 #40 #41 #43 #44 #45 were all OPEN/UNMERGED.
- The 56/56 check-run count requires independent check-suite inventory; a Vercel status alone cannot prove it.

## Evidence requirements and accepted classifications
M9's 16 immutable source gates are inherited. M10 adds twelve external gates in `M10_EXTERNAL_GATE_IDS`:
1. Original chain ID 18881 factory/creator issuance receipts and independent contract review.
2. Original ULTRA/LOOKE quote-token, pair/router, reserve and trade sources (no fake statistics).
3. Canonical finalized owned-wallet portfolio with observed block and wallet authorization.
4. Cloudinary/media originals, content owner and real moderator actions.
5. Independent cryptography/security audit before message transport or E2EE is enabled.
6. Original issuer-signed game points, social reconciliation and human anti-sybil ruling.
7. Independent external auditor reports, findings, patches and retests.
8. Two independently authenticated human security/operator sign-offs, not public-key strings.
9. Actual distinct TLS current/backup sources, full schema and row fingerprints and external recovery witness.
10. Signed-out HTTP SSO denial with timestamp, URL, and exact commit/deployment binding.
11. Independent incident/recovery exercise and authorization-free rollback plan evidence.
12. Live Vercel control-plane production alias unchanged.

**Important:** Passing unit/integration/Foundry/Preview CI means only engineering checks passed. `assessFinal10M10` intentionally treats submitted references as **unverified**, cannot verify external human identity or signatures, and ALWAYS returns `NO_GO`. Technical digests are not attestation, contract or database provenance, security approval, or launch authorization.

## Operator procedure (read-only)
1. Independently repeat GitHub workflow and check-run inventory for final exact M10 commit; inspect failures and exact preview build SHA.
2. Inspect deployed Preview via signed-out browser and original HTTP response for SSO challenge, then with authorized operator and verify wallet-scoped session and restricted API access. Do not expose credentials.
3. Obtain authenticated original wallet session/nonce logs, moderated posts/media receipts, genuine contract proofs/reserves, finality-aligned owned-wallet balances, issuer-authorized quarantined game events and separate anti-sybil evidence. Record exact URI/row ID/block/hash, time, chain ID, reviewer and access scope without storing secrets.
4. With explicit separate operator approval, inspect actual current TLS social_* database and independently restored TLS backup via existing read-only M9 CLI. Confirm all present tables, full schema/row digests, backup origin, snapshot cutoff and independent witness. **Never use legacy Neon looke_* as a replacement**.
5. Have independent external auditors authenticate originals, findings and retests. Obtain two distinct *human* review signatures through an approved external review process; do not self-attest via CI fixtures.
6. Conduct witnessed incident and rollback tabletop/read-only rehearsal, verify production alias still pinned. Any actual production change requires a new explicit approval.
7. Reassess every blocker. Keep release NO-GO until a separate owner-approved governance/release decision exists. Do not merge this draft as part of this package.

## Remaining blockers
Original approved current PostgreSQL TLS source; independently restored backup and witness; signed consumed wallet sessions; genuine Cloudinary/media and moderation; original chain deployment and real market liquidity; portfolio finality; actual game issuer/anti-sybil human review; original external security audits/retests; two human operator/security signatures; independently observed SSO challenge; witnessed incident recovery. None is established by passing M10's technical fixtures.

**Final decision: NO-GO for public beta, live trading, Mainnet, E2EE or Points conversion.** Engineering PR readiness and live source/human approval are separate outcomes.
