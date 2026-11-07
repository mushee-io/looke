# Final 10 / M2 — Ultra EVM Testnet wallet identity and creator profiles

## What M2 adds
- Extends the verified M1 PR #37 head ebe156d3ee0269052a2633d84f28078344714f9b on a stacked, isolated PR.
- Ultra EVM Testnet chain 18881 selected wallet account must remain authorized through nonce signing and verification. Account and chain changes clear the client session and request server revocation.
- One-time signed EIP-191 challenge, scoped origin, nonce, expiration, wallet address and chain. No signing of approval, permit, transaction or asset transfer.
- Secure hashed seven-day HttpOnly SameSite Strict sessions, server-authoritative wallet address, server logout revocation.
- Real PostgreSQL-unique @handles, reserved official namespaces, owner-aware handle availability feedback, and owner-only profile editing.
- Identity sign-in and profile writes have a separate feature gate. Enabling identity does not enable social posts, uploads, Points, creator coins, swaps, transfers, public beta or messaging.

## Operator controls
- LOOKE_M2_IDENTITY_WRITES_ENABLED=true is explicitly opt-in, default false, and permits identity challenge/session/profile writes only.
- The approved current PostgreSQL DATABASE_URL and exact HTTPS LOOKE_SOCIAL_APP_ORIGIN are also required for protected Preview sign-in.
- The existing Neon legacy looke_* tables are NOT the required social_* schema. Do not auto-migrate original legacy source or enable against it. Run migrations only against independently approved fresh isolated test environment and preserve original sources.
- Keep LOOKE_SOCIAL_WRITES_ENABLED=false and all public beta, media, Points, token, finance, and private messaging flags off.
- Production alias looke-alpha.vercel.app remains pinned to dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG. Do not promote M2 to production or open beta.
- Public GET readiness metadata is only configuration-presence, not actual independent database or wallet acceptance.

## Automated checks
- npm run test:final-m2 checks reserved names, selected-wallet permission and chain-switch denial.
- npm run test:final-m2-db checks two genuine ephemeral local CI-wallet signature challenges with disposable PostgreSQL, atomic nonce replay denial, owner-only profile updates, unique handles, session isolation, logout revocation and the closed posting gate.
- Existing historical CI, M1 test, typecheck, build, Solidity tests, and Preview security checks remain required.
- Only deploy a final exact fully green M2 commit to existing SSO-protected Vercel branch Preview.

## Real user acceptance still required
The protected Vercel Preview currently lacks an approved current social PostgreSQL URL, exact operator-origin configuration and independent live wallet witness records. M2 can pass engineering CI but live signup/profile persistence remains BLOCKED until those real sources are approved and configured. CI-created ephemeral test wallets and records are NOT genuine user acceptance.

When an operator provides the approved isolated current database and Preview origin, perform two distinct-wallet sign-in and @handle collision checks, reject account/network switch, confirm no asset-signing requests and test cookie logout. Independently record original evidence and review before enabling the M2 identity flag. Do not proceed to M3 until user explicitly selects it.
