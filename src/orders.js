import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
export class OrderError extends Error{constructor(message,status=400,code='INVALID_ORDER',details){super(message);Object.assign(this,{status,code,details})}}
function field(value,label,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new OrderError('Revisá '+label+'.');return value.trim()}
export function orderInput(body,{customer=false}={}){
 if(!body||typeof body!=='object'||!Array.isArray(body.items)||!body.items.length||body.items.length>100)throw new OrderError('Elegí los artículos de tu pedido.');
 if(typeof body.invoice!=='boolean')throw new OrderError('Indicá la modalidad de facturación.');
 const seen=new Set();const items=body.items.map(row=>{const variantId=typeof row?.variant_id==='string'?row.variant_id.toLowerCase():'';if(!row||!UUID.test(variantId)||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>999||seen.has(variantId))throw new OrderError('Revisá las opciones y cantidades de tu pedido.');seen.add(variantId);return {variant_id:variantId,quantity:row.quantity}}).sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
 const result={items,invoice:body.invoice};
 if(customer){if(!UUID.test(body.idempotency_key)||!UUID.test(body.access_token)||!['whatsapp','pdf','email'].includes(body.channel)||typeof body.quote_signature!=='string'||!/^[a-f0-9]{64}$/.test(body.quote_signature))throw new OrderError('Reintentá preparar tu pedido.');
 const c=body.customer||{};result.customer={name:field(c.name,'tu nombre',200,true),phone:field(c.phone,'tu teléfono',13,true),email:field(c.email,'tu email',254,true),business:field(c.business,'el comercio',200),address:field(c.address,'la dirección',500),payment:field(c.payment,'el medio de pago',100,true)};
 if(!/^[0-9]{8,13}$/.test(result.customer.phone)||!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(result.customer.email))throw new OrderError('Revisá tu teléfono y email.');
 result.idempotency_key=body.idempotency_key;result.access_token=body.access_token;result.channel=body.channel;result.quote_signature=body.quote_signature;
 }return result;
}
export function cents(value){if(typeof value!=='string'||!/^\d{1,12}[.]\d{2}$/.test(value))throw new OrderError('Consultar precio.',409,'PRICE_REQUIRES_CONSULTATION');return BigInt(value.replace('.',''))}
export function amount(value){return (value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0')}
export function calculateQuote(input,rows){
 const byId=new Map(rows.map(row=>[row.variant_id,row]));let subtotal=0n;const issues=[];const items=input.items.map(item=>{const v=byId.get(item.variant_id);if(!v||v.supplier_available!==true||v.supplier_price_ars===null){issues.push({variant_id:item.variant_id,message:!v||v.supplier_available!==true?'Consultar disponibilidad':'Consultar precio'});return null}const unit=cents(v.supplier_price_ars);if(unit<=0n){issues.push({variant_id:item.variant_id,message:'Consultar precio'});return null}const total=unit*BigInt(item.quantity);subtotal+=total;return {variant_id:v.variant_id,product_id:v.source_id,nombre:v.name,codigo:v.supplier_code,color:v.color,embalaje:v.packaging_original,qty:item.quantity,precio_pesos:v.supplier_price_ars,importe:amount(total),fecha_lista:v.document_date,batch_id:v.batch_id}});
 if(issues.length)throw new OrderError('Algunos artículos requieren consulta. Podés consultarnos por WhatsApp.',409,'CONSULTATION_REQUIRED',{issues});
 const tax=input.invoice?(subtotal*21n+50n)/100n:0n;const total=subtotal+tax;
 if(total>99999999999999n)throw new OrderError('Consultanos para preparar este pedido.');
 const quote={items,invoice:input.invoice,iva_porcentaje:input.invoice?21:0,subtotal:amount(subtotal),iva:amount(tax),total:amount(total)};
 return {...quote,signature:hash(JSON.stringify(quote))};
}
const selectVariants=`SELECT v.variant_id,p.source_id,p.name,p.packaging_original,v.supplier_code,v.color,v.supplier_price_ars::text,v.supplier_available,v.document_date::text,v.batch_id FROM gm.current_variant_state v JOIN gm.products p ON p.id=v.product_id WHERE p.active AND v.variant_id=ANY($1::uuid[])`;
function publicOrder(row){return {id:row.id,numero:'GM-'+String(row.order_number).padStart(6,'0'),created_at:row.created_at,channel:row.channel,invoice:row.invoice,customer:row.customer,items:row.items,subtotal:row.subtotal,iva:row.tax,total:row.total,status:row.status,message:'Solicitud de pedido sujeta a confirmación de GM Electronics.'}}
export class Orders{
 constructor(pool){this.pool=pool}
 async quote(body){const input=orderInput(body);const {rows}=await this.pool.query(selectVariants,[input.items.map(row=>row.variant_id)]);return calculateQuote(input,rows)}
 async create(body){
 const input=orderInput(body,{customer:true});const requestHash=hash(JSON.stringify(input));const tokenHash=hash(input.access_token);const client=await this.pool.connect();
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[input.idempotency_key]);const existing=await client.query('SELECT * FROM gm.orders WHERE idempotency_key=$1',[input.idempotency_key]);
 if(existing.rows.length){if(existing.rows[0].request_hash!==requestHash)throw new OrderError('Reintentá preparar el pedido con sus datos actuales.',409,'IDEMPOTENCY_CONFLICT');await client.query('COMMIT');return {order:publicOrder(existing.rows[0]),reused:true}}
 await client.query('SELECT id FROM gm.suppliers ORDER BY id FOR SHARE');const {rows}=await client.query(selectVariants,[input.items.map(row=>row.variant_id)]);const quote=calculateQuote(input,rows);
 if(quote.signature!==input.quote_signature)throw new OrderError('La información del pedido cambió. Revisala antes de confirmar.',409,'QUOTE_CHANGED',{quote});
 const saved=await client.query(`INSERT INTO gm.orders(id,idempotency_key,request_hash,access_token_hash,channel,invoice,customer,items,subtotal,tax,total) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11) RETURNING *`,[randomUUID(),input.idempotency_key,requestHash,tokenHash,input.channel,input.invoice,JSON.stringify(input.customer),JSON.stringify(quote.items),quote.subtotal,quote.iva,quote.total]);
 await client.query('COMMIT');return {order:publicOrder(saved.rows[0]),reused:false};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }
 async get(id,token){if(!UUID.test(id)||!UUID.test(token))throw new OrderError('Acceso al pedido no válido.',404,'ORDER_NOT_FOUND');const {rows}=await this.pool.query('SELECT * FROM gm.orders WHERE id=$1',[id]);if(!rows.length||!timingSafeEqual(Buffer.from(rows[0].access_token_hash,'hex'),Buffer.from(hash(token),'hex')))throw new OrderError('Acceso al pedido no válido.',404,'ORDER_NOT_FOUND');return publicOrder(rows[0])}
}
