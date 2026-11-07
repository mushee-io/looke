# Final10 / M5 — Protected Ultra EVM Testnet messaging foundations

## Verified predecessor (2026-11-07)
- M1 PR #37, M2 PR #38, M3 PR #39 remain open and unmerged.
- M4 PR #40 exact verified SHA: 1bb6112d6535a9980012ad65ce3a24a33c55d0a9; open/draft/unmerged.
- M4 exact SHA 31/31 GitHub Actions and 42/42 checks SUCCESS; dedicated creator-security and disposable PostgreSQL jobs passed; main web/contracts/social_db passed.
- M4 SSO-protected Vercel Preview dpl_CPXSSWvWqAbtTsNo82gVjckNpyZR READY at exact commit.
- Production alias looke-alpha.vercel.app remains pinned to dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG and must not change.

## M5 scope: security foundation, NOT live messaging
- New opt-in LOOKE_M5_MESSAGE_REQUEST_WRITES_ENABLED gate defaults false and requires M2 identity + M3 social, a protected Vercel Preview context and beta false. A request is metadata only, NOT an encrypted message or permission to transport data.
- Only logged-in wallet sessions can view incoming/outgoing requests. Requester may cancel; recipient may accept/decline; neither can alter the other's account or claim an identity using user-supplied sender fields.
- Atomic unordered-pair uniqueness rejects duplicates and opposite-direction request-spam; 8 actions per 10-minute actor window; blocking/muting in either direction and suspended profiles prevent request creation, acceptance and visibility. No message notifications from blocked or muted accounts.
- Existing wallet-scoped genuine notification feed now includes only actual pending request metadata for the owner under the M5 gate, categorized as Other, never fake content or messages.
- Message tab retains the approved layout and shows only actual owner-scoped request metadata when the approved DB is configured. The message composer still cannot send anything.
- Future offline client sealed-envelope validator insists on canonical padded base64, 24-byte nonce, bounded ciphertext, nonzero distinct Ultra EVM addresses; computes SHA-256 nonce digest for a future uniqueness guard. This does not prove cipher authenticity or implement encryption.
- Explicit one-way key rotation sequence validation and signed-origin assertion format remain OFFLINE ONLY. The new PostgreSQL public-key-version and nonce digest tables are schema-only: no key registration, message-send API, key uploads, storage of plaintext or live encrypted messages.
- Existing social_dm_envelopes storage is NOT used by M5 and no route writes into it. Key recovery and encryption security audit are not complete.
- The read-only readiness endpoint openly reports message transport, key registration and recovery as DISABLED/UNAPPROVED. No fabricated sent counts or on-chain activity.
- M5 works only with actual authorized current social_* PostgreSQL. Applying migrations to the old legacy looke_* Neon source is PROHIBITED without separate explicit approval. Migrations run only in disposable CI, not on production.

## Testing and safeguards
- npm run test:final-m5 verifies offline validation, account distinction, impersonation and replay constraints, key rotation, origin binding and all default-OFF gates.
- npm run test:final-m5-db uses three ephemeral signed wallets and disposable PostgreSQL to verify ownership, requests, block/mute, notifications, acceptance denial, unique unordered pairs, schema key versions and nonce replay uniqueness. These are fixtures, NEVER actual wallet owners or real messages.
- New dedicated CI plus main historical TypeScript, application, SQL, contract and secure Preview regressions required green on final SHA.
- No live messaging, private key management, on-chain action, public beta, financial broadcast, token issuance, public launch, recurring build or production deployment.

## Real-source NO-GO blockers
The operator-approved real TLS PostgreSQL social_* database, signed-in real two-wallet witness, exact Preview HTTPS origin, independently audited client crypto, original encryption/key-registration/recovery approvals, independent spam/moderation review and audited restore/rollback evidence are NOT available. CI-only fixtures must not be represented as real users.
Keep M2/M3/M4/M5 hosted write flags all OFF until actual sources and human authorization. Live E2EE and request transport must remain denied; future activation requires a separate reviewed change, not just a flag.

## Release discipline
M5 is a stacked draft PR on exact verified M4; no predecessor merges. Its engineering status can be PASS only after exact final commit has every required CI check success and SSO-protected branch Preview READY. Only then show a one-click Build M6 control; do not start M6 automatically. Engineering PASS does not mean operational Testnet GO.
