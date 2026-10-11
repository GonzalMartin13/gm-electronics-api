// Bundles are ordered as one line. Gonzalo handles their component procurement.
export const combos=[
 {id:'f52b7941-cd16-41b1-a92d-aaaaaaaaaa01',codigo:'PackEco',nombre:'GM Start 100K · Esencial',precio_pesos:'102454.00',units:37,cables:19,chargers:8,audio:10},
 {id:'f52b7941-cd16-41b1-a92d-aaaaaaaaaa02',codigo:'PackMid',nombre:'GM Start 200K · Comercial',precio_pesos:'205187.00',units:50,cables:23,chargers:12,audio:15},
 {id:'f52b7941-cd16-41b1-a92d-aaaaaaaaaa03',codigo:'PackPro',nombre:'GM Start 350K · Full',precio_pesos:'370724.00',units:89,cables:42,chargers:19,audio:28},
].map(combo=>({...combo,stock_disponible:true,embalaje:`1 pack de ${combo.units} unidades: ${combo.cables} cables, ${combo.chargers} cargadores y ${combo.audio} auriculares. Modelos y entrega a confirmar con Gonzalo.`}));
export function comboRows(ids){return combos.filter(combo=>ids.includes(combo.id)).map(combo=>({variant_id:combo.id,source_id:combo.codigo,name:combo.nombre,supplier_code:combo.codigo,color:null,packaging_original:combo.embalaje,supplier_price_ars:combo.precio_pesos,supplier_available:combo.stock_disponible,document_date:'2026-10-11',batch_id:null}));}
