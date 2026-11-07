-- M8 staged game candidates are NOT balances, awards, conversions or tokens.
-- PostgreSQL only in disposable CI; do not migrate original Neon without human approval.
CREATE TABLE IF NOT EXISTS social_game_source_identities_m8 (
 source varchar(40) NOT NULL CHECK(source ~ '^[a-z][a-z0-9-]{2,39}$'),
 source_identity_hash char(66) NOT NULL CHECK(source_identity_hash ~ '^0x[0-9a-f]{64}$'),
 owner text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source,source_identity_hash),
 UNIQUE(source,owner)
);
CREATE TABLE IF NOT EXISTS social_game_import_candidates_m8 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 source varchar(40) NOT NULL,
 source_identity_hash char(66) NOT NULL,
 source_event_id varchar(96) NOT NULL CHECK(source_event_id ~ '^[a-zA-Z0-9:_-]{8,96}$'),
 source_record_hash char(66) NOT NULL CHECK(source_record_hash ~ '^0x[0-9a-f]{64}$'),
 season_id uuid NOT NULL REFERENCES social_points_seasons(id) ON DELETE RESTRICT,
 claimed_points integer NOT NULL CHECK(claimed_points BETWEEN 1 AND 100000),
 occurred_at timestamptz NOT NULL,
 issuer text NOT NULL CHECK(issuer ~ '^0x[0-9a-f]{40}$'),
 reviewer text NOT NULL CHECK(reviewer ~ '^0x[0-9a-f]{40}$'),
 attestation_hash char(64) NOT NULL CHECK(attestation_hash ~ '^[0-9a-f]{64}$'),
 client_nonce char(32) NOT NULL CHECK(client_nonce ~ '^[0-9a-f]{32}$'),
 status varchar(12) NOT NULL DEFAULT 'quarantined' CHECK(status='quarantined'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source,source_identity_hash)
   REFERENCES social_game_source_identities_m8(source,source_identity_hash),
 UNIQUE(source,source_event_id),
 UNIQUE(source,source_record_hash),
 UNIQUE(owner,client_nonce),
 UNIQUE(attestation_hash),
 CHECK(issuer<>reviewer AND owner<>issuer AND owner<>reviewer)
);
CREATE INDEX IF NOT EXISTS social_game_candidates_owner_m8
 ON social_game_import_candidates_m8(owner,created_at DESC,id DESC);
