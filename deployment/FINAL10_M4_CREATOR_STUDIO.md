# Looke Final10 M4 — protected Ultra EVM Testnet Creator Studio

## Baseline verified before build
- M1 PR #37 exact head ebe156d3ee0269052a2633d84f28078344714f9b OPEN UNMERGED.
- M2 PR #38 exact head dedf0360a532c3a75ccd4bf415966184d513faa8 OPEN DRAFT UNMERGED.
- M3 PR #39 exact head 0951b0b4e13a02eb7327ae5917677f2d8f02e3be OPEN DRAFT UNMERGED.
- M3 30/30 workflows and 40/40 checks successful. Dedicated M3 social and PostgreSQL jobs successful.
- M3 protected SSO Vercel deployment dpl_3k1HHESwirRPSdb4Pwp3aBi1fmiQ READY, exact M3 SHA.
- Original looke-alpha.vercel.app production alias remains on dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG. No alias modifications.

## M4 engineering features (not claimed live)
- Preserve approved Looke Discover homepage, Trending creator area, Messages, notifications, wallet modal, profile and Coin/ULTRA/LOOKE pair draft UI.
- Independently scoped media gate LOOKE_M4_CREATOR_MEDIA_WRITES_ENABLED (default false), only when M2/M3 flags and LOOKE_MEDIA_UPLOADS_ENABLED are explicitly approved, not on Vercel production, and only with beta disabled.
- An additional separate LOOKE_M4_MEDIA_MODERATION_WRITES_ENABLED flag (default false) gates media-only moderator approvals/rejections. No general moderator/suspend/hide powers are conferred.
- Existing one-use, origin-checked wallet-authenticated Cloudinary signed authorization is reused. Server verifies the original asset through Cloudinary authenticated Admin API, matching owner-scoped public_id, resource type, file format/size, canonical HTTPS asset URL, provider asset ID, original creation date/version within authorization window; stores original provider proof ID and verification timestamp in real PostgreSQL.
- GET /api/experience/media?intentId=<uuid> is owner-only no-store evidence: original DB upload provider identity, provider asset ID, original verified timestamps, attached post, moderation status and latest auditable moderation action. Does not expose Cloudinary API credentials.
- Atomic attached post consumes one verified owner upload and is hidden until independently approved. M4 approval additionally checks the attached original stored provider identity and media URL inside the moderation SQL transaction; audited moderator ID and reason retained in Postgres. Wrong-wallet, reused, not-issued, expired and unauthenticated uploads fail closed.
- New /api/experience/creator-draft endpoint validates bounded token draft, selected ULTRA or LOOKE pairing, public HTTPS/IPFS/Arweave metadata references; does not fetch content, attest remote metadata, store tokens, issue coins, connect liquidity, submit any wallet signature or broadcast.
- M3-only text-post flow stays unchanged unless M4 enabled; M4-only still denies posting arbitrary client media URLs or attaching token references.
- No live Cloudinary credentials or remote user data are introduced. CI uses **mocked** Cloudinary JSON and ephemeral random test wallets, explicitly NOT live provider/operator evidence.

## Operational blockers and release gate
The earlier checked Neon integration is legacy-only looke_* tables, NOT the current PostgreSQL social_* schema required for new user media records. Current user-owned authenticated TLS PostgreSQL connection, authorized Cloudinary cloud/account, exact branch Preview LOOKE_SOCIAL_APP_ORIGIN, enrolled independent moderator, true server-to-server Cloudinary receipt, actual two-wallet original user-upload proof, manual moderation witness and independent restore/security sign-offs remain unverified. Do not fabricate them or migrate legacy data.

All live M2/M3/M4 write flags, media uploads/moderation, general social master writes, Points, financial transactions, token issuance, swaps and public beta stay OFF until approved evidence and operator action. NO production/mainnet deployment, NO recurring builders, NO fabricated posts/approvals.

## Verification
Exact final-head GitHub Actions and check-runs must all be SUCCESS, including npm test, final-m1/m2/m3/m4, typecheck, production build, Foundry, and disposable PostgreSQL M4.
Deploy only that exact passing M4 commit to SSO-protected Vercel branch Preview and retain original alpha alias. Leave M4 stacked draft PR unmerged. Engineering PASS does not imply operational Testnet GO.
Only after engineering acceptance provide **one Build M5** user-controlled action, never auto-build.
