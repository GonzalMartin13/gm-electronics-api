import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {Accounts,createIdentityVerifier} from '../src/accounts.js';
import {makePool} from '../src/config.js';
import {Orders,calculateQuote} from '../src/orders.js';
import {createApp} from '../src/app.js';

const base='https://auth.example.com/neondb/auth';
const {privateKey,publicKey}=await generateKeyPair('EdDSA');
const verify=createIdentityVerifier(base,{jwks:publicKey});
const identity={sub:randomUUID(),email:'client@example.com',emailVerified:true,name:'Cliente'};
async function token(claims=identity,options={}){
 return new SignJWT(claims).setProtectedHeader({alg:'EdDSA'}).setIssuedAt().setExpirationTime(options.exp||'15m').setIssuer(options.issuer||new URL(base).origin).setAudience(options.audience||new URL(base).origin).sign(privateKey);
}
test('account identity verifies signature, expiry, issuer, audience and email ownership',async()=>{
 const valid=await token();assert.equal((await verify('Bearer '+valid)).id,identity.sub);
 for(const header of [undefined,'Bearer guest', 'Bearer '+valid.slice(0,-4)+'AAAA','Bearer '+await token({...identity,emailVerified:false}),'Bearer '+await token(identity,{issuer:'https://attacker.example'}),'Bearer '+await token(identity,{audience:'another-app'}),'Bearer '+await token(identity,{exp:'-1s'}),'Bearer '+await token({...identity,banned:true})])await assert.rejects(()=>verify(header));
});
test('account history never queries by email and hides another customer order',async()=>{
 const own=randomUUID(),other=randomUUID(),orderId=randomUUID();
 const pool={async query(sql,args){assert.ok(sql.includes('customer_account_id=$'));assert.equal(sql.includes('email'),false);return {rows:args.includes(own)?[{id:orderId,order_number:1}]:[]}}};
 const orders=new Orders(pool);
 assert.equal((await orders.history(own)).data.length,1);
 assert.equal((await orders.getForAccount(orderId,own)).id,orderId);
 await assert.rejects(()=>orders.getForAccount(orderId,other),e=>e.status===404);
});
test('idempotency cannot reveal an existing guest or another account order',async()=>{
 const variant=randomUUID(),accountId=randomUUID();
 const body={items:[{variant_id:variant,quantity:1}],invoice:false,customer:{name:'Cliente',phone:'1178234289',email:'client@example.com',payment:'Efectivo'},idempotency_key:randomUUID(),access_token:randomUUID(),channel:'pdf',quote_signature:'0'.repeat(64)};
 let rolledBack=false;
 const orders=new Orders({async connect(){return {release(){},async query(sql){if(sql.startsWith('SELECT *'))return {rows:[{customer_account_id:randomUUID(),request_hash:'ignored'}]};if(sql==='ROLLBACK')rolledBack=true;return {rows:[]}}}}});
 await assert.rejects(()=>orders.create(body,{accountId}),e=>e.code==='IDEMPOTENCY_CONFLICT');assert.ok(rolledBack);
});
test('protected API denies anonymous requests and invalid account tokens cannot create guest orders',async()=>{
 let creates=0,reads=0;
 const orders={async create(_body,context){creates++;return {order:{id:randomUUID(),accountId:context.accountId}}},async history(id){reads++;return {data:[{accountId:id}]}},async getForAccount(){throw Error('Unused')}};
 const accountId=randomUUID();
 const app=createApp({catalog:{pool:{}},config:{corsOrigins:['*'],exposeSupplierPrices:true},orders,accounts:{async ensure(){return {id:accountId}}},verifyIdentity:verify,logger:{error(){}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 try{
   assert.equal((await fetch(url+'/api/v1/me/orders')).status,401);assert.equal(reads,0);
   const auth='Bearer '+await token();
   const history=await fetch(url+'/api/v1/me/orders',{headers:{Authorization:auth}});assert.equal(history.status,200);assert.equal(history.headers.get('cache-control'),'no-store');assert.equal((await history.json()).data[0].accountId,accountId);
   assert.equal((await fetch(url+'/api/v1/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer invalid'},body:'{}'})).status,401);assert.equal(creates,0);
   const created=await fetch(url+'/api/v1/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:auth},body:'{}'});assert.equal(created.status,201);assert.equal((await created.json()).data.accountId,accountId);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('local database stores profiles and isolates two customers, including guest orders with the same email',async()=>{
 const pool=makePool();let local=false;const accountIds=[],keys=[];
 try{
  const host=pool.options.connectionString?new URL(pool.options.connectionString).hostname:process.env.PGHOST;
  assert.equal(host,'127.0.0.1','Integration test must use the local database');
  const server=(await pool.query('SELECT host(inet_server_addr()) AS host,current_database() AS db')).rows[0];
  assert.equal(server.host,'127.0.0.1');assert.equal(server.db,'gm_electronics');local=true;
  const accounts=new Accounts(pool),orders=new Orders(pool),first={id:randomUUID(),email:'same@example.com',name:'Cliente A'},second={id:randomUUID(),email:'same@example.com',name:'Cliente B'};
  const a=await accounts.ensure(first),b=await accounts.ensure(second);accountIds.push(a.id,b.id);assert.notEqual(a.id,b.id);
  const profile=await accounts.update(first,{name:'Cliente A',phone:'1178234289',business:'Comercio de prueba',address:'Prueba local'});
  assert.equal(profile.business,'Comercio de prueba');assert.equal((await accounts.ensure(second)).business,'');
  const variant=(await pool.query('SELECT variant_id FROM gm.current_variant_state WHERE supplier_available IS TRUE AND supplier_price_ars>0 LIMIT 1')).rows[0].variant_id;
  async function create(accountId){
   const key=randomUUID();keys.push(key);
   const input={items:[{variant_id:variant,quantity:1}],invoice:false,customer:{name:'Prueba local',phone:'1178234289',email:first.email,payment:'Efectivo'},idempotency_key:key,access_token:randomUUID(),channel:'pdf'};
   input.quote_signature=(await orders.quote(input)).signature;
   return (await orders.create(input,{accountId})).order;
  }
  const own=await create(a.id),other=await create(b.id),guest=await create(null);
  assert.deepEqual((await orders.history(a.id)).data.map(row=>row.id),[own.id]);
  assert.deepEqual((await orders.history(b.id)).data.map(row=>row.id),[other.id]);
  for(const id of [other.id,guest.id])await assert.rejects(()=>orders.getForAccount(id,a.id),e=>e.status===404);
  assert.equal((await orders.getForAccount(own.id,a.id)).total,own.total);
 }finally{
  if(local){if(keys.length)await pool.query('DELETE FROM gm.orders WHERE idempotency_key=ANY($1::uuid[])',[keys]);if(accountIds.length)await pool.query('DELETE FROM gm.customer_accounts WHERE id=ANY($1::uuid[])',[accountIds])}
  await pool.end();
 }
});
