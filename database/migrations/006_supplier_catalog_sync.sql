-- Supplier list is the authoritative current catalog. Retain historical rows for orders.
ALTER TABLE gm.product_variants ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION gm.sync_supplier_catalog(target_supplier uuid) RETURNS jsonb LANGUAGE plpgsql AS $sync$
DECLARE current_batch uuid; item record; variant_row gm.product_variants%ROWTYPE; product_key uuid; category_key uuid; desired_source text; added integer:=0; corrected integer:=0; retired integer:=0;
BEGIN
 SELECT current_batch_id INTO current_batch FROM gm.suppliers WHERE id=target_supplier FOR UPDATE;
 IF current_batch IS NULL OR NOT EXISTS(SELECT 1 FROM gm.supplier_rows WHERE batch_id=current_batch) THEN RAISE EXCEPTION 'Cannot reconcile without a complete supplier list'; END IF;
 FOR item IN
 WITH unique_codes AS(SELECT supplier_code_normalized code FROM gm.supplier_rows WHERE batch_id=current_batch GROUP BY 1 HAVING count(*)=1)
 SELECT r.* FROM gm.supplier_rows r JOIN unique_codes u ON u.code=r.supplier_code_normalized
 WHERE r.batch_id=current_batch AND NOT coalesce((r.raw_record->>'excluded')::boolean,false)
 LOOP
  SELECT * INTO variant_row FROM gm.product_variants WHERE supplier_id=target_supplier AND supplier_code=item.supplier_code_normalized;
  IF variant_row.id IS NULL OR EXISTS(SELECT 1 FROM gm.variant_snapshots s WHERE s.variant_id=variant_row.id AND s.batch_id=current_batch AND s.match_status='name_conflict') THEN
   desired_source:='fastec-'||item.supplier_code_normalized;
   category_key:=md5('gm/list-sync/category/Otros')::uuid;
   INSERT INTO gm.categories(id,name) VALUES(category_key,'Otros') ON CONFLICT(name) DO NOTHING;
   SELECT id INTO category_key FROM gm.categories WHERE name='Otros';
   product_key:=md5('gm/list-sync/product/'||target_supplier::text||'/'||item.supplier_code_normalized)::uuid;
   INSERT INTO gm.products(id,source_id,name,description,category_id,source_record)
   VALUES(product_key,desired_source,item.source_name,'',category_key,jsonb_build_object('source','supplier_list','supplier_code',item.supplier_code_normalized,'batch_id',current_batch))
   ON CONFLICT(source_id) DO UPDATE SET name=EXCLUDED.name;
   SELECT id INTO product_key FROM gm.products WHERE source_id=desired_source;
   IF variant_row.id IS NULL THEN
    INSERT INTO gm.product_variants(id,product_id,supplier_id,supplier_code)
    VALUES(md5('gm/list-sync/variant/'||target_supplier::text||'/'||item.supplier_code_normalized)::uuid,product_key,target_supplier,item.supplier_code_normalized)
    RETURNING * INTO variant_row;
    added:=added+1;
   ELSE
    UPDATE gm.products SET active=false WHERE id=variant_row.product_id;
    DELETE FROM gm.variant_images WHERE variant_id=variant_row.id;
    UPDATE gm.product_variants SET product_id=product_key,color=NULL WHERE id=variant_row.id;
    corrected:=corrected+1;
   END IF;
  END IF;
  INSERT INTO gm.variant_snapshots(id,variant_id,batch_id,supplier_id,price_ars,price_usd,supplier_available,match_status)
  VALUES(md5('gm/list-sync/snapshot/'||current_batch::text||'/'||variant_row.id::text)::uuid,variant_row.id,current_batch,target_supplier,item.price_ars,item.price_usd,item.supplier_available,'matched')
  ON CONFLICT(variant_id,batch_id) DO UPDATE SET price_ars=EXCLUDED.price_ars,price_usd=EXCLUDED.price_usd,supplier_available=EXCLUDED.supplier_available,match_status='matched';
  INSERT INTO gm.snapshot_source_rows(snapshot_id,row_id,batch_id)
  SELECT id,item.id,current_batch FROM gm.variant_snapshots WHERE variant_id=variant_row.id AND batch_id=current_batch ON CONFLICT DO NOTHING;
 END LOOP;
 SELECT count(*) INTO retired FROM gm.product_variants v WHERE v.supplier_id=target_supplier AND v.active AND NOT EXISTS(
 SELECT 1 FROM gm.supplier_rows r WHERE r.batch_id=current_batch AND r.supplier_code_normalized=v.supplier_code AND NOT coalesce((r.raw_record->>'excluded')::boolean,false)
 GROUP BY r.supplier_code_normalized HAVING count(*)=1);
 UPDATE gm.product_variants v SET active=EXISTS(
 SELECT 1 FROM gm.supplier_rows r WHERE r.batch_id=current_batch AND r.supplier_code_normalized=v.supplier_code AND NOT coalesce((r.raw_record->>'excluded')::boolean,false)
 GROUP BY r.supplier_code_normalized HAVING count(*)=1) WHERE v.supplier_id=target_supplier;
 UPDATE gm.products p SET active=EXISTS(SELECT 1 FROM gm.product_variants v WHERE v.product_id=p.id AND v.active)
 WHERE EXISTS(SELECT 1 FROM gm.product_variants v WHERE v.product_id=p.id AND v.supplier_id=target_supplier);
 RETURN jsonb_build_object('batch_id',current_batch,'new_codes',added,'corrected_reused_codes',corrected,'retired_codes',retired,'active_codes',(SELECT count(*) FROM gm.product_variants WHERE supplier_id=target_supplier AND active));
END $sync$;

CREATE OR REPLACE VIEW gm.current_variant_state AS
SELECT v.id AS variant_id,v.product_id,v.supplier_code,v.color,s.price_ars AS supplier_price_ars,s.price_usd AS supplier_price_usd,s.supplier_available,coalesce(s.match_status,'code_not_found') AS match_status,b.document_date,b.processed_at,b.id AS batch_id
FROM gm.product_variants v JOIN gm.suppliers supplier ON supplier.id=v.supplier_id
LEFT JOIN gm.import_batches b ON b.id=supplier.current_batch_id
LEFT JOIN gm.variant_snapshots s ON s.variant_id=v.id AND s.batch_id=b.id WHERE v.active;

CREATE OR REPLACE FUNCTION gm.apply_import_batch(target uuid) RETURNS void LANGUAGE plpgsql AS $apply$
DECLARE batch gm.import_batches%ROWTYPE; supplier gm.suppliers%ROWTYPE; previous_date date;
BEGIN
 SELECT * INTO batch FROM gm.import_batches WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Import batch does not exist'; END IF;
 SELECT * INTO supplier FROM gm.suppliers WHERE id=batch.supplier_id FOR UPDATE;
 SELECT * INTO batch FROM gm.import_batches WHERE id=target FOR UPDATE;
 IF supplier.current_batch_id=target THEN PERFORM gm.sync_supplier_catalog(batch.supplier_id); RETURN; END IF;
 IF batch.status<>'prepared' THEN RAISE EXCEPTION 'Import batch already applied'; END IF;
 SELECT document_date INTO previous_date FROM gm.import_batches WHERE id=supplier.current_batch_id;
 IF previous_date IS NOT NULL AND batch.document_date<previous_date THEN RAISE EXCEPTION 'An older price list cannot replace a newer list'; END IF;
 IF (SELECT count(*) FROM gm.variant_snapshots WHERE batch_id=target)<>(SELECT count(*) FROM gm.product_variants WHERE supplier_id=batch.supplier_id) THEN RAISE EXCEPTION 'Import batch is incomplete'; END IF;
 UPDATE gm.import_batches SET status='applied',applied_at=now() WHERE id=target;
 UPDATE gm.suppliers SET current_batch_id=target WHERE id=batch.supplier_id;
 PERFORM gm.sync_supplier_catalog(batch.supplier_id);
END $apply$;

SELECT gm.sync_supplier_catalog('4e65fb12-1455-5a2b-8487-e6ce5e87c18d'::uuid) AS reconciliation;
