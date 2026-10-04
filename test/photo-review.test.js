import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {serializeProduct,serializeVariant} from '../src/catalog.js';
import {excludedImagePaths} from '../src/photo-review.js';
import {createApp} from '../src/app.js';

const context={prices:true,assetUrl:path=>'https://example.test/'+path};
const variant={codigo:'1984',precio_pesos:'5034.00',precio_usd:'3.36',stock_disponible:true,imagenes:['images/1984_0.jpg','images/1984_1.jpg']};
test('review removes selected photos without changing product or variant commercial data',()=>{
  assert.equal(excludedImagePaths.length,651);
  const result=serializeVariant(variant,context);
  assert.deepEqual(result.imagenes,['https://example.test/images/1984_0.jpg']);
  assert.equal(result.precio_pesos,variant.precio_pesos);
  assert.equal(result.stock_disponible,true);
  const product=serializeProduct({id:'test',imagen:'images/1984_1.jpg',variantes:[variant]},context);
  assert.equal(product.imagen,null);
  assert.equal(product.variantes.length,1);
  const empty=serializeVariant({...variant,imagenes:['images/1984_1.jpg']},context);
  assert.deepEqual(empty.imagenes,[]);
});
test('removed photos are unavailable over HTTP, including encoded paths, while kept photos remain',async()=>{
  const server=createApp({catalog:{pool:null},orders:{},config:{corsOrigins:['*'],adminKey:'',exposeSupplierPrices:true}}).listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/images/1984_1.jpg','/images/%31%39%38%34_1.jpg']){
      const response=await fetch(base+path);
      assert.equal(response.status,404);
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
    const kept=await fetch(base+'/images/1984_0.jpg');
    assert.equal(kept.status,200);
    assert.equal(kept.headers.get('content-type'),'image/jpeg');
  }finally{server.close();await once(server,'close');}
});

