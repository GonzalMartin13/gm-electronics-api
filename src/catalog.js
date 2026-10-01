// Query only the published supplier batch. Never use historical JSON prices as a fallback.
const productSelect = `
 SELECT p.id AS api_id, p.source_id AS id, p.name AS nombre,
 c.name AS categoria, p.description AS descripcion, p.packaging_original AS embalaje,
 m.original_path AS imagen, availability.supplier_available AS stock_disponible,
 coalesce(variant_data.variantes, '[]'::jsonb) AS variantes
 FROM gm.products p
 JOIN gm.categories c ON c.id=p.category_id
 JOIN gm.current_product_availability availability ON availability.product_id=p.id
 LEFT JOIN gm.media_assets m ON m.id=p.primary_image_id
 LEFT JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object(
     'api_id', v.variant_id, 'codigo', v.supplier_code, 'color', v.color,
     'precio_pesos', v.supplier_price_ars::text, 'precio_usd', v.supplier_price_usd::text,
     'stock_disponible', v.supplier_available, 'estado_actualizacion', v.match_status,
     'fecha_lista', v.document_date::text,
     'imagenes', coalesce((SELECT jsonb_agg(asset.original_path ORDER BY images.position)
       FROM gm.variant_images images JOIN gm.media_assets asset ON asset.id=images.asset_id
       WHERE images.variant_id=v.variant_id), '[]'::jsonb)
   ) ORDER BY v.supplier_code) AS variantes
   FROM gm.current_variant_state v WHERE v.product_id=p.id
 ) variant_data ON true`;

export class Catalog {
  constructor(pool) { this.pool = pool; }
  async ready() {
    const { rows } = await this.pool.query(`SELECT
      (SELECT count(*)::int FROM gm.products WHERE active) AS productos,
      (SELECT count(*)::int FROM gm.product_variants) AS variantes,
      (SELECT max(document_date)::text FROM gm.import_batches WHERE status='applied') AS fecha_lista`);
    if (!rows[0].productos || !rows[0].fecha_lista) throw new Error('Catalog not imported');
    return rows[0];
  }
  async categories() {
    const { rows } = await this.pool.query(`SELECT c.id, c.name AS nombre, count(p.id)::int AS productos
      FROM gm.categories c LEFT JOIN gm.products p ON p.category_id=c.id AND p.active
      GROUP BY c.id ORDER BY c.name`);
    return rows;
  }
  async list({ page, limit, q, category, availability, minPrice, maxPrice, sort }) {
    const params = [];
    const conditions = ['p.active'];
    const bind = value => { params.push(value); return '$' + params.length; };
    if (q) {
      const value = bind(q.replace(/[\\%_]/g, '\\$&'));
      conditions.push(`(p.name ILIKE '%' || ${value} || '%' OR p.description ILIKE '%' || ${value} || '%' OR c.name ILIKE '%' || ${value} || '%' OR EXISTS
        (SELECT 1 FROM gm.product_variants code WHERE code.product_id=p.id AND code.supplier_code=${value}))`);
    }
    if (category) { const value=bind(category); conditions.push(`(c.name=${value} OR c.id::text=${value})`); }
    if (availability) conditions.push(`availability.supplier_available IS ${availability === 'available' ? 'TRUE' : availability === 'unavailable' ? 'FALSE' : availability === 'consult' ? 'NOT TRUE' : 'NULL'}`);
    // When filtering price and stock, require that the SAME variant satisfies both.
    if (minPrice !== undefined || maxPrice !== undefined) {
      const variantWhere = ['priced.product_id=p.id'];
      if (minPrice !== undefined) variantWhere.push(`priced.supplier_price_ars >= ${bind(minPrice)}::numeric`);
      if (maxPrice !== undefined) variantWhere.push(`priced.supplier_price_ars <= ${bind(maxPrice)}::numeric`);
      if (availability) variantWhere.push(`priced.supplier_available IS ${availability === 'available' ? 'TRUE' : availability === 'unavailable' ? 'FALSE' : availability === 'consult' ? 'NOT TRUE' : 'NULL'}`);
      conditions.push(`EXISTS (SELECT 1 FROM gm.current_variant_state priced WHERE ${variantWhere.join(' AND ')})`);
    }
    const where=' WHERE '+conditions.join(' AND ');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { rows: count } = await client.query(`SELECT count(*)::int AS total FROM gm.products p
        JOIN gm.categories c ON c.id=p.category_id JOIN gm.current_product_availability availability ON availability.product_id=p.id ${where}`, params);
      const sortPrice=`coalesce((SELECT min(s.supplier_price_ars) FROM gm.current_variant_state s WHERE s.product_id=p.id AND s.supplier_available IS TRUE),(SELECT min(s.supplier_price_ars) FROM gm.current_variant_state s WHERE s.product_id=p.id))`;
      const order=sort==='priceAsc'?sortPrice+' ASC NULLS LAST, p.source_id':sort==='priceDesc'?sortPrice+' DESC NULLS LAST, p.source_id':'p.source_id';
      const { rows } = await client.query(productSelect+where+` ORDER BY ${order} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params,limit,(page-1)*limit]);
      await client.query('COMMIT');
      return { data: rows, pagination: { page, limit, total: count[0].total, pages: Math.ceil(count[0].total/limit) } };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async product(id) {
    const { rows } = await this.pool.query(productSelect+' WHERE p.active AND (p.source_id=$1 OR p.id::text=$1)', [id]);
    return rows[0] || null;
  }
  async variant(id) {
    const { rows } = await this.pool.query(`SELECT p.source_id FROM gm.product_variants v
      JOIN gm.products p ON p.id=v.product_id WHERE p.active AND (v.id::text=$1 OR v.supplier_code=$1)`, [id]);
    if (!rows.length) return null;
    const product = await this.product(rows[0].source_id);
    return { product_id: product.id, ...product.variantes.find(v => v.api_id===id || v.codigo===id) };
  }
}

function smallestPrice(variants) {
  const priced=variants.filter(v => v.precio_pesos !== null && v.precio_usd !== null);
  if (!priced.length) return null;
  const cents=value => BigInt(value.replace('.', ''));
  return priced.reduce((a,b) => cents(a.precio_pesos)<=cents(b.precio_pesos) ? a : b);
}
export function serializeProduct(product, { assetUrl, prices }) {
  const reference=smallestPrice(product.variantes);
  return {
    ...product,
    imagen: product.imagen ? assetUrl(product.imagen) : null,
    precio_pesos: prices ? reference?.precio_pesos ?? null : null,
    precio_usd: prices ? reference?.precio_usd ?? null : null,
    precio_codigo_referencia: prices ? reference?.codigo ?? null : null,
    precio_es_desde: prices && new Set(product.variantes.map(v => v.precio_pesos).filter(v => v!==null)).size>1,
    precios_completos: prices && product.variantes.every(v => v.precio_pesos!==null && v.precio_usd!==null),
    origen_precio: prices ? 'lista_proveedor' : null,
    variantes: product.variantes.map(v => serializeVariant(v,{assetUrl,prices})),
  };
}
export function serializeVariant(variant, { assetUrl, prices }) {
  return { ...variant, precio_pesos: prices ? variant.precio_pesos : null,
    precio_usd: prices ? variant.precio_usd : null, imagenes: variant.imagenes.map(assetUrl) };
}

