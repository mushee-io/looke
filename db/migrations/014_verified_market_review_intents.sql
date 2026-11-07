-- Final10 M7. NO transaction, allowance, liquidity, token or execution records.
-- Strictly private unsigned quote REVIEW metadata; apply to disposable CI only.
CREATE TABLE IF NOT EXISTS social_market_review_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner text NOT NULL REFERENCES social_profiles(address) ON DELETE CASCADE,
 client_nonce char(32) NOT NULL CHECK(client_nonce ~ '^[0-9a-f]{32}$'),
 market_id varchar(32) NOT NULL CHECK(market_id ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
 direction varchar(4) NOT NULL CHECK(direction IN ('buy','sell')),
 base_token text NOT NULL CHECK(base_token ~ '^0x[0-9a-f]{40}$'),
 quote_token text NOT NULL CHECK(quote_token ~ '^0x[0-9a-f]{40}$'),
 router text NOT NULL CHECK(router ~ '^0x[0-9a-f]{40}$'),
 pair text NOT NULL CHECK(pair ~ '^0x[0-9a-f]{40}$'),
 quote_preference varchar(5) NOT NULL CHECK(quote_preference IN ('ULTRA','LOOKE')),
 amount_in varchar(80) NOT NULL CHECK(amount_in ~ '^[1-9][0-9]{0,79}$'),
 minimum_output varchar(80) NOT NULL CHECK(minimum_output ~ '^[1-9][0-9]{0,79}$'),
 quoted_output varchar(80) NOT NULL CHECK(quoted_output ~ '^[1-9][0-9]{0,79}$'),
 slippage_bps integer NOT NULL CHECK(slippage_bps BETWEEN 1 AND 300),
 quote_block varchar(32) NOT NULL CHECK(quote_block ~ '^[0-9]+$'),
 quoted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 status varchar(8) NOT NULL DEFAULT 'review' CHECK(status='review'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner,client_nonce),
 CHECK(expires_at>quoted_at AND expires_at<=quoted_at+interval '10 minutes'),
 CHECK(quote_preference IN ('ULTRA','LOOKE')),
 CHECK(base_token<>quote_token AND pair<>router)
);
CREATE INDEX IF NOT EXISTS social_market_review_intents_owner_idx
 ON social_market_review_intents(owner,created_at DESC);
