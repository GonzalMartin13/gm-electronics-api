CREATE TABLE gm.orders (
 id uuid PRIMARY KEY,
 order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 idempotency_key uuid UNIQUE NOT NULL,
 request_hash text NOT NULL,
 access_token_hash text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('whatsapp','pdf','email')),
 invoice boolean NOT NULL,
 customer jsonb NOT NULL,
 items jsonb NOT NULL,
 subtotal numeric(14,2) NOT NULL CHECK(subtotal>0),
 tax numeric(14,2) NOT NULL CHECK(tax>=0),
 total numeric(14,2) NOT NULL CHECK(total=subtotal+tax),
 status text NOT NULL DEFAULT 'received' CHECK(status='received')
);
COMMENT ON TABLE gm.orders IS 'Private order requests, calculated from the published supplier list. Availability is not a stock reservation.';
