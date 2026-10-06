CREATE TABLE gm.customer_accounts (
  id uuid PRIMARY KEY,
  auth_user_id text UNIQUE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  business text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gm.orders ADD COLUMN customer_account_id uuid REFERENCES gm.customer_accounts(id);
CREATE INDEX orders_customer_history ON gm.orders(customer_account_id, created_at DESC, id DESC)
  WHERE customer_account_id IS NOT NULL;
COMMENT ON COLUMN gm.orders.customer_account_id IS 'Verified identity at creation; never inferred from customer email. Guest orders remain unassigned.';
