import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {makePool} from '../src/config.js';

async function verify() {
 const report={base:process.env.RENDER_EXTERNAL_URL,checks:[],products:0,variants:0};
 const base=report.base;
 if(!base)return;
 const get=async path=>{
  const response=await fetch(base+path,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,'HTTP '+path);
  return response.json();
 };
 let status='failed';
 try {
  const expected=JSON.parse(gunzipSync(Buffer.from(await readFile(new URL('../data/catalog-check.json.gz.b64',import.meta.url),'utf8'),'base64')).toString('utf8'));
  const expectedVariants=expected.reduce((n,p)=>n+p.variantes.length,0);
  const ready=await get('/ready');assert.equal(ready.productos,expected.length);assert.equal(ready.variantes,expectedVariants);report.checks.push('public_https_ready');

  const products=[];
  for(let page=1;page<=Math.ceil(expected.length/100);page++){
   const result=await get(`/api/v1/products?limit=100&page=${page}`);assert.equal(result.pagination.total,expected.length);products.push(...result.data);
  }
  assert.equal(new Set(products.map(p=>p.id)).size,expected.length);
  for(const original of expected){
   const actual=products.find(p=>String(p.id)===String(original.id));assert.ok(actual);assert.equal(actual.nombre,original.nombre);assert.equal(actual.stock_disponible,original.stock_disponible);
   for(const variant of original.variantes){const v=actual.variantes.find(v=>v.codigo===String(variant.codigo).padStart(4,'0'));assert.ok(v);assert.equal(v.stock_disponible,variant.stock_disponible);assert.equal(v.precio_pesos===null?null:Number(v.precio_pesos),variant.precio_pesos===null?null:Number(variant.precio_pesos));assert.equal(v.precio_usd===null?null:Number(v.precio_usd),variant.precio_usd===null?null:Number(variant.precio_usd));}
  }
  report.products=products.length;report.variants=products.reduce((n,p)=>n+p.variantes.length,0);assert.equal(report.variants,expectedVariants);report.checks.push('all_products_variants_prices_stock');
  assert.equal((await get('/api/v1/categories')).data.length,13);report.checks.push('categories');
  assert.equal((await get('/api/v1/variants/765')).data.precio_pesos,'3661.00');assert.equal((await get('/api/v1/variants/2362')).data.stock_disponible,null);report.checks.push('updated_price_and_conflict');
  const manifest=JSON.parse(await readFile(new URL('../data/image-manifest.json',import.meta.url),'utf8'));
  const imageUrls=[products.find(p=>p.imagen).imagen,products.flatMap(p=>p.variantes).find(v=>v.imagenes.length).imagenes[0]];
  for(const imageUrl of imageUrls){const response=await fetch(imageUrl,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());const path=decodeURIComponent(new URL(imageUrl).pathname.slice(1));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest[path]);}
  report.checks.push('public_images_sha256');
  const invalid=await fetch(base+'/api/v1/products?limit=101',{signal:AbortSignal.timeout(15000)});assert.equal(invalid.status,400);
  const missing=await fetch(base+'/api/v1/products/no-such-product',{signal:AbortSignal.timeout(15000)});assert.equal(missing.status,404);report.checks.push('invalid_query_and_missing_product');
  status='passed';
 }catch(error){report.error=error.message.slice(0,240);}
 const pool=makePool({admin:true});
 try {await pool.query('INSERT INTO gm.deployment_checks(git_commit,status,report) VALUES ($1,$2,$3)',[process.env.RENDER_GIT_COMMIT||null,status,report]);}
 finally {await pool.end();}
 console.log('Public deployment verification:',status,JSON.stringify(report));
}
if(process.env.RENDER_EXTERNAL_URL)setTimeout(()=>verify().catch(()=>console.error('Deployment verification could not be recorded')),15000).unref();

