# Final10 / M3 — Ultra EVM-only creator feed acceptance

## Verified predecessors
- M1 PR #37 still unmerged; final M1 head: ebe156d3ee0269052a2633d84f28078344714f9b.
- M2 PR #38 still unmerged/draft; exact passed final head dedf0360a532c3a75ccd4bf415966184d513faa8.
- M2 29/29 Actions workflows, 38/38 check-runs; dedicated identity + PostgreSQL job checks SUCCESS. Vercel protected branch Preview dpl_p3X67prmnZ3SH2EgoD6pzN99zX9c READY.
- M3 starts as a standalone stacked draft PR against the M2 branch. Do not merge predecessors or redeploy Production.

## M3 code scope
- Reuse actual PostgreSQL-backed social_profiles, social_posts, social_follows, social_comments, social_post_likes, social_post_reposts, social_post_bookmarks, social_notification_reads, social_notification_preferences.
- Server-session authoritative Ultra EVM Testnet 18881 wallet ownership for posts, replies, follows, likes, bookmarks, reposts, read receipts and private activity. Do not trust client-supplied actor/author/owner.
- PostgreSQL rows are authoritative: never fabricate users, posts, interactions, followers, token balances, synthetic prices or notifications.
- Feed remains filtered for suspended/blocked creators, hidden/deleted posts, unapproved hosted media; account-scoped notification history only references real events.
- M3 write gate LOOKE_M3_SOCIAL_WRITES_ENABLED=true requires M2 identity gate (or existing historically approved social master switch) and an approved real current PostgreSQL source. Default false.
- M3 allowlist is text post, reply, follow/unfollow, block/unblock, report; dedicated engagement endpoint allows like/unlike, repost/unrepost, private save/unsave; notifications mark-read and account preferences/mutes are owner scoped.
- Under M3-only activation, post creation cannot attach token references, media URLs or upload intents. Those remain M4/M6. Server moderator operations remain restricted to separate review gates. Financial issuance, trading, Points, messaging, media and public beta remain OFF.
- Preserve the market-first homepage, trending creator space, messages navigation, token draft/pairing UI, notifications, wallet modal and profile. No synthetic content.

## Required operator sources / release blockers
- Original connected Neon source observed in earlier acceptance was legacy-only (looke_*), not the required current social_* tables. Do not automatically migrate, overwrite or reuse it.
- An explicitly approved isolated CURRENT PostgreSQL endpoint with correct social_* schema, TLS, backups and moderation support is required before enabling M2/M3 live wallet writes.
- Exact operator-approved HTTPS LOOKE_SOCIAL_APP_ORIGIN must match the SSO-protected Vercel branch Preview hostname; no production-host cookie leak.
- Real nonfinancial operator-signed two-wallet sessions, genuine posts/replies/likes/follows/notifications, moderation, independent human sign-off, and database recovery proof are still missing. CI ephemeral wallet keys and disposable Postgres data are NOT operator sign-off.
- Keep LOOKE_M2_IDENTITY_WRITES_ENABLED and LOOKE_M3_SOCIAL_WRITES_ENABLED FALSE in live Vercel until prerequisites verified. Historical LOOKE_SOCIAL_WRITES_ENABLED remains FALSE. Nothing in this milestone triggers or schedules builds.
- Production alias looke-alpha.vercel.app remains pinned to dpl_29EdVrfrJNTC5Q7gkZMcpaxLhQiG. Do not touch Production, Mainnet, public beta, token issuance or financial transaction APIs.

## CI and acceptance
- npm test; npm run test:final-m1; npm run test:final-m2; npm run test:final-m3; npm run typecheck; npm run build; forge test; all historical required CI; disposable PostgreSQL tests npm run test:final-m3-db.
- M3 integration tests use generated ephemeral signed CI-wallet sessions and disposable Postgres. They validate real SQL behavior, not production social activity.
- Accept only exact final M3 GitHub commit with every workflow and check successful and Vercel SSO-protected branch Preview READY for that exact SHA. Keep M3 draft while live source prerequisites are unsatisfied.
- Engineering CI PASS is NOT operational Testnet release GO. Surface blockers precisely.
- Once M3 engineering passes, show one Build M4 control. Never start M4 until user clicks.
