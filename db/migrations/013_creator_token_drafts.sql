-- Final10 M6: unsigned wallet-owned creator plans ONLY.
-- NO transaction hashes, deployed token addresses, liquidity, fees collected,
-- token ownership claims, automatic migrations or asset execution.
CREATE TABLE IF NOT EXISTS social_creator_token_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 chain_id integer NOT NULL DEFAULT 18881 CHECK (chain_id=18881),
 token_name varchar(64) NOT NULL CHECK(length(btrim(token_name)) BETWEEN 2 AND 64),
 token_symbol varchar(12) NOT NULL CHECK(token_symbol ~ '^[A-Z0-9]{2,12}$'),
 metadata_uri text NOT NULL CHECK(length(metadata_uri) BETWEEN 1 AND 700),
 initial_supply_units numeric(78,0) NOT NULL CHECK(initial_supply_units>0
   AND initial_supply_units<=1000000000000000000000000000),
 pair_preference text NOT NULL CHECK(pair_preference IN ('ULTRA','LOOKE')),
 client_nonce char(66) NOT NULL CHECK(client_nonce ~ '^0x[0-9a-f]{64}$'),
 calldata_hash char(66) NOT NULL CHECK(calldata_hash ~ '^0x[0-9a-f]{64}$'),
 app_fee_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(app_fee_wei=0),
 status text NOT NULL DEFAULT 'prepared' CHECK(status='prepared'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 minutes'),
 CONSTRAINT creator_intent_unique_nonce UNIQUE(owner,client_nonce),
 CONSTRAINT creator_intent_expiry CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS creator_intents_owner_created
 ON social_creator_token_intents(owner,created_at DESC,id DESC);
