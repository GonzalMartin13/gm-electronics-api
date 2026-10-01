CREATE SCHEMA gm;
SET search_path TO gm, public;

CREATE TABLE categories (
  id uuid PRIMARY KEY,
  name text UNIQUE NOT NULL CHECK (btrim(name) <> '')
);
CREATE TABLE media_assets (
  id uuid PRIMARY KEY,
  original_path text UNIQUE NOT NULL,
  storage_key text,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX media_assets_content_idx ON media_assets(sha256);
CREATE TABLE products (
  id uuid PRIMARY KEY,
  source_id text UNIQUE NOT NULL CHECK (btrim(source_id) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  category_id uuid NOT NULL REFERENCES categories(id),
  packaging_original text,
  primary_image_id uuid REFERENCES media_assets(id),
  active boolean NOT NULL DEFAULT true,
  source_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products(category_id);
CREATE INDEX products_search_idx ON products USING gin
  (to_tsvector('spanish', name || ' ' || description));
CREATE TABLE suppliers (
  id uuid PRIMARY KEY,
  name text UNIQUE NOT NULL,
  current_batch_id uuid
);
CREATE TABLE product_variants (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_code text NOT NULL CHECK (btrim(supplier_code) <> ''),
  color text,
  legacy_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(supplier_id, supplier_code),
  UNIQUE(id, supplier_id)
);
CREATE INDEX product_variants_product_idx ON product_variants(product_id);
CREATE TABLE import_batches (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  source_filename text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  document_date date NOT NULL,
  list_version text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','applied')),
  summary jsonb NOT NULL,
  UNIQUE(supplier_id, source_sha256),
  UNIQUE(id, supplier_id),
  CHECK ((status = 'applied') = (applied_at IS NOT NULL))
);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_current_batch_fk
  FOREIGN KEY (current_batch_id, id) REFERENCES import_batches(id, supplier_id);
CREATE TABLE supplier_rows (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES import_batches(id),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  supplier_code_original text NOT NULL,
  supplier_code_normalized text NOT NULL,
  source_name text NOT NULL,
  source_sheet text NOT NULL,
  source_code_cell text NOT NULL,
  price_ars numeric(14,2) CHECK (price_ars > 0),
  price_usd numeric(14,2) CHECK (price_usd > 0),
  supplier_available boolean,
  source_color text,
  raw_record jsonb NOT NULL,
  UNIQUE(batch_id, ordinal),
  UNIQUE(id, batch_id)
);
CREATE INDEX supplier_rows_code_idx ON supplier_rows(batch_id, supplier_code_normalized);
CREATE TABLE variant_snapshots (
  id uuid PRIMARY KEY,
  variant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  price_ars numeric(14,2) CHECK (price_ars > 0),
  price_usd numeric(14,2) CHECK (price_usd > 0),
  supplier_available boolean,
  match_status text NOT NULL CHECK (match_status IN
    ('matched','code_not_found','name_conflict','code_conflict')),
  FOREIGN KEY (variant_id, supplier_id) REFERENCES product_variants(id, supplier_id),
  FOREIGN KEY (batch_id, supplier_id) REFERENCES import_batches(id, supplier_id),
  UNIQUE(variant_id, batch_id),
  UNIQUE(id, batch_id),
  CHECK ((price_ars IS NULL) = (price_usd IS NULL)),
  CHECK (match_status = 'matched' OR
    (price_ars IS NULL AND price_usd IS NULL AND supplier_available IS NULL))
);
CREATE INDEX variant_snapshots_batch_idx ON variant_snapshots(batch_id);
CREATE TABLE snapshot_source_rows (
  snapshot_id uuid NOT NULL,
  row_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  PRIMARY KEY(snapshot_id, row_id),
  FOREIGN KEY(snapshot_id, batch_id) REFERENCES variant_snapshots(id, batch_id),
  FOREIGN KEY(row_id, batch_id) REFERENCES supplier_rows(id, batch_id)
);
CREATE TABLE variant_images (
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  asset_id uuid NOT NULL REFERENCES media_assets(id),
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY(variant_id, position)
);

-- Publish an entire validated snapshot, never half an import.
CREATE FUNCTION apply_import_batch(target uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  batch import_batches%ROWTYPE;
  supplier suppliers%ROWTYPE;
  previous_date date;
BEGIN
  SELECT * INTO batch FROM import_batches WHERE id = target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch does not exist'; END IF;
  SELECT * INTO supplier FROM suppliers WHERE id = batch.supplier_id FOR UPDATE;
  SELECT * INTO batch FROM import_batches WHERE id = target FOR UPDATE;
  IF supplier.current_batch_id = target THEN RETURN; END IF;
  IF batch.status <> 'prepared' THEN RAISE EXCEPTION 'Import batch already applied'; END IF;
  SELECT document_date INTO previous_date FROM import_batches WHERE id = supplier.current_batch_id;
  IF previous_date IS NOT NULL AND batch.document_date < previous_date THEN
    RAISE EXCEPTION 'An older price list cannot replace a newer list';
  END IF;
  IF (SELECT count(*) FROM variant_snapshots WHERE batch_id = target) <>
     (SELECT count(*) FROM product_variants WHERE supplier_id = batch.supplier_id) THEN
    RAISE EXCEPTION 'Import batch is incomplete';
  END IF;
  UPDATE import_batches SET status='applied', applied_at=now() WHERE id=target;
  UPDATE suppliers SET current_batch_id=target WHERE id=batch.supplier_id;
END;
$$;

CREATE VIEW current_variant_state AS
SELECT v.id AS variant_id, v.product_id, v.supplier_code, v.color,
       s.price_ars AS supplier_price_ars, s.price_usd AS supplier_price_usd,
       s.supplier_available, coalesce(s.match_status,'code_not_found') AS match_status,
       b.document_date, b.processed_at, b.id AS batch_id
FROM product_variants v
JOIN suppliers supplier ON supplier.id=v.supplier_id
LEFT JOIN import_batches b ON b.id=supplier.current_batch_id
LEFT JOIN variant_snapshots s ON s.variant_id=v.id AND s.batch_id=b.id;

CREATE VIEW current_product_availability AS
SELECT p.id AS product_id, p.source_id, p.name,
  CASE WHEN count(v.variant_id) = 0 THEN NULL
       WHEN bool_or(v.supplier_available IS TRUE) THEN true
       WHEN count(v.variant_id) = count(*) FILTER (WHERE v.supplier_available IS FALSE) THEN false
       ELSE NULL END AS supplier_available
FROM products p LEFT JOIN current_variant_state v ON v.product_id=p.id
GROUP BY p.id;

CREATE VIEW public_catalog AS
SELECT p.id, p.source_id, p.name, p.description, c.name AS category,
       p.packaging_original, a.supplier_available, m.original_path AS primary_image
FROM products p JOIN categories c ON c.id=p.category_id
JOIN current_product_availability a ON a.product_id=p.id
LEFT JOIN media_assets m ON m.id=p.primary_image_id
WHERE p.active;

COMMENT ON COLUMN variant_snapshots.supplier_available IS
  'Supplier availability: true=green, false=yellow, null=unconfirmed. Not unit quantity.';
COMMENT ON VIEW public_catalog IS 'Catalog without supplier costs. Retail pricing policy is not defined yet.';
