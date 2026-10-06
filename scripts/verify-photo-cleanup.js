import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {excludedImagePaths,isExcludedImage} from '../src/photo-review.js';
import {productPhoto,variantPhotoPaths,replacementAssets} from '../src/photo-replacements.js';
import {createHash} from 'node:crypto';

const base='https://gm-electronics-api.onrender.com';
const expected=JSON.parse(await readFile(new URL('../../outputs/productos-ampliados.json',import.meta.url),'utf8'));
const products=[];
for(let page=1;page<=Math.ceil(expected.length/100);page++){
  const response=await fetch(base+'/api/v1/products?limit=100&page='+page,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.pagination.total,expected.length);products.push(...data.data);
}
const imagePath=url=>url?decodeURIComponent(new URL(url,base).pathname.slice(1)):null;
const byId=new Map(products.map(p=>[p.id,p]));
let variants=0;const visible=new Set();
for(const original of expected){
  const actual=byId.get(original.id);assert.ok(actual,original.id);
  assert.equal(actual.nombre,original.nombre);
  assert.equal(actual.stock_disponible,original.stock_disponible);
  const primary=productPhoto(original)?.path??null;
  assert.equal(imagePath(actual.imagen),primary);
  if(actual.imagen)visible.add(actual.imagen);
  for(const variant of original.variantes){
    const current=actual.variantes.find(v=>v.codigo===String(variant.codigo).padStart(4,'0'));assert.ok(current);
    assert.equal(current.stock_disponible,variant.stock_disponible);
    for(const key of ['precio_pesos','precio_usd'])assert.equal(current[key]===null?null:Number(current[key]),variant[key]===null?null:Number(variant[key]));
    assert.deepEqual(current.imagenes.map(imagePath),variantPhotoPaths(variant));
    current.imagenes.forEach(url=>visible.add(url));variants++;
  }
}
console.log('Catalog verified:',JSON.stringify({products:products.length,variants,visible_images:visible.size}));
for(let offset=0;offset<excludedImagePaths.length;offset+=12){
  await Promise.all(excludedImagePaths.slice(offset,offset+12).map(async path=>{
    const response=await fetch(base+'/'+path,{signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,404,path+' still accessible');await response.body?.cancel();
  }));
}
const kept=await fetch([...visible][0],{signal:AbortSignal.timeout(20000)});assert.equal(kept.status,200);await kept.body?.cancel();
for(const [path,asset] of Object.entries(replacementAssets)){
  const response=await fetch(base+'/'+path,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,path);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,asset.bytes,path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,path);
}
console.log('PASS:',JSON.stringify({removed_images:excludedImagePaths.length,products:products.length,variants,visible_images:visible.size,prices_and_stock_preserved:true}));
