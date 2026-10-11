import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Orders} from '../src/orders.js';
import {combos} from '../src/combos.js';
test('combo and regular product coexist; server prices override client amounts and quantities count packs',async()=>{
 const regular={variant_id:randomUUID(),name:'Cable',supplier_code:'223',supplier_price_ars:'100.00',supplier_available:true};
 let saved;
 const client={release(){},async query(sql,args){if(sql.includes('current_variant_state'))return {rows:[regular]};if(sql.startsWith('SELECT * FROM gm.orders'))return {rows:saved?[saved]:[]};if(sql.startsWith('INSERT INTO gm.orders')){saved={id:args[0],order_number:1,created_at:new Date().toISOString(),request_hash:args[2],access_token_hash:args[3],channel:args[4],invoice:args[5],customer:JSON.parse(args[6]),items:JSON.parse(args[7]),subtotal:args[8],tax:args[9],total:args[10],customer_account_id:args[11],status:'received'};return {rows:[saved]}}return {rows:[]}}};
 const orders=new Orders({query:client.query.bind(client),connect:async()=>client});
 const body={items:[{variant_id:combos[0].id,quantity:2},{variant_id:regular.variant_id,quantity:1}],invoice:true,customer:{name:'Test',phone:'1100000000',email:'test@example.com',payment:'Transferencia'},channel:'pdf',idempotency_key:randomUUID(),access_token:randomUUID(),total:1,precio_pesos:1};
 const quote=await orders.quote(body);assert.equal(quote.subtotal,'205008.00');assert.equal(quote.total,'248059.68');
 const result=await orders.create({...body,quote_signature:quote.signature});assert.equal(result.order.items.find(item=>item.codigo==='PackEco').qty,2);assert.equal(result.order.items.find(item=>item.codigo==='PackEco').precio_pesos,'102454.00');assert.equal(result.order.items.find(item=>item.codigo==='0223').qty,1);assert.equal(result.order.total,quote.total);
 assert.equal((await orders.get(result.order.id,body.access_token)).items.find(item=>item.codigo==='PackEco').embalaje,combos[0].embalaje);
 const repeated=await orders.create({...body,quote_signature:quote.signature});assert.equal(repeated.reused,true);
 await assert.rejects(()=>orders.quote({items:[{variant_id:randomUUID(),quantity:1}],invoice:false}),error=>error.code==='CONSULTATION_REQUIRED');
});
test('all three pack codes and prices have a signed server quote',async()=>{
 const orders=new Orders({query:async()=>({rows:[]})});
 for(const pack of combos){const quote=await orders.quote({items:[{variant_id:pack.id,quantity:1}],invoice:false});assert.equal(quote.items[0].codigo,pack.codigo);assert.equal(quote.total,pack.precio_pesos);assert.equal(quote.signature.length,64)}
});
