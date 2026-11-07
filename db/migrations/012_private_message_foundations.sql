-- Final10 M5: protected request metadata, key-version & nonce foundations ONLY.
-- No plaintext columns, message transport, key upload or automated migration.
-- All writes require a separate, reviewed, explicit server-side operator flag.
CREATE TABLE IF NOT EXISTS social_dm_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requester text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 recipient text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','canceled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 CONSTRAINT social_dm_request_distinct_wallets CHECK (requester <> recipient),
 CONSTRAINT social_dm_request_resolved CHECK (
   (status='pending' AND resolved_at IS NULL) OR (status<>'pending' AND resolved_at IS NOT NULL)
 )
);
-- Prevent reciprocal duplicates and request cycling across both directions.
CREATE UNIQUE INDEX IF NOT EXISTS social_dm_requests_pair_unique
 ON social_dm_requests (LEAST(requester,recipient),GREATEST(requester,recipient));
CREATE INDEX IF NOT EXISTS social_dm_requests_incoming
 ON social_dm_requests(recipient,status,created_at DESC);
CREATE INDEX IF NOT EXISTS social_dm_requests_outgoing
 ON social_dm_requests(requester,status,created_at DESC);

-- Future independently audited public-key rotation ledger. No key registration API.
CREATE TABLE IF NOT EXISTS social_dm_key_versions (
 owner text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 key_version integer NOT NULL CHECK (key_version BETWEEN 1 AND 10000),
 public_key text NOT NULL CHECK (char_length(public_key) BETWEEN 43 AND 44),
 announced_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 PRIMARY KEY(owner,key_version),
 CONSTRAINT social_dm_key_revocation_order CHECK(revoked_at IS NULL OR revoked_at>=announced_at)
);
-- Future unique nonce replay guard, without storing plaintext or ciphertext.
CREATE TABLE IF NOT EXISTS social_dm_nonce_registry (
 sender text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 recipient text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 sender_key_version integer NOT NULL CHECK(sender_key_version BETWEEN 1 AND 10000),
 recipient_key_version integer NOT NULL CHECK(recipient_key_version BETWEEN 1 AND 10000),
 nonce_digest char(64) NOT NULL CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(sender,recipient,sender_key_version,recipient_key_version,nonce_digest),
 CHECK(sender<>recipient)
);
CREATE INDEX IF NOT EXISTS social_dm_nonce_registry_age ON social_dm_nonce_registry(created_at);
-- This schema intentionally does not enable message sends or E2EE.
