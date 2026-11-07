-- Final10 M6: one-use owner-scoped preview metadata ONLY. No transaction
-- hashes, deployment claims, wallet approvals, token pairs or liquidity records.
-- Do not apply to legacy Neon or real sources without explicit human approval.
CREATE TABLE IF NOT EXISTS social_creator_deployment_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
  client_nonce char(32) NOT NULL CHECK(client_nonce ~ '^[0-9a-f]{32}$'),
  name varchar(64) NOT NULL CHECK(char_length(name) BETWEEN 2 AND 64),
  symbol varchar(12) NOT NULL CHECK(symbol ~ '^[A-Z0-9]{2,12}$'),
  metadata_uri varchar(240) NOT NULL CHECK(
    metadata_uri LIKE 'ipfs://%' OR metadata_uri LIKE 'ar://%'),
  supply_tokens varchar(13) NOT NULL CHECK(supply_tokens ~ '^[1-9][0-9]{0,12}$'),
  quote_preference varchar(5) NOT NULL CHECK(quote_preference IN ('ULTRA','LOOKE')),
  status varchar(12) NOT NULL DEFAULT 'prepared' CHECK(status='prepared'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '10 minutes'),
  UNIQUE(owner,client_nonce)
);
CREATE INDEX IF NOT EXISTS social_creator_deployment_previews_owner_idx
  ON social_creator_deployment_previews(owner,created_at DESC);
