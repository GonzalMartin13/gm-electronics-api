-- Restore exact source newlines after an initial Windows CRLF SQL export.
UPDATE gm.products SET
  name = source_record->>'nombre',
  description = source_record->>'descripcion',
  packaging_original = nullif(source_record->>'embalaje','');
UPDATE gm.supplier_rows SET source_name = raw_record->>'nombre';
UPDATE gm.product_variants v SET color=nullif(source.value->>'color','')
FROM gm.products p CROSS JOIN LATERAL jsonb_array_elements(p.source_record->'variantes') source(value)
WHERE v.product_id=p.id AND source.value->>'codigo'=v.supplier_code;
