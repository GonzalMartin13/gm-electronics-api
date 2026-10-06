import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {serializeProduct,serializeVariant} from '../src/catalog.js';
import {photoReplacements,replacementAssets} from '../src/photo-replacements.js';
import {excludedImagePaths} from '../src/photo-review.js';
const context={prices:true,assetUrl:path=>'https://example.test/'+path};
const v={codigo:'5011',precio_pesos:'2000.00',precio_usd:'1.33',stock_disponible:true,imagenes:[]};

test('missing color galleries receive their own curated photo without changing commercial data',()=>{
  const black=serializeVariant(v,context);
  const pink=serializeVariant({...v,codigo:'5014'},context);
  assert.deepEqual(black.imagenes,[context.assetUrl(photoReplacements['5011'].path)]);
  assert.notDeepEqual(black.imagenes,pink.imagenes);
  for(const key of ['precio_pesos','precio_usd','stock_disponible'])assert.equal(black[key],v[key]);
  const hidden=serializeVariant(v,{...context,prices:false});assert.equal(hidden.precio_pesos,null);assert.equal(hidden.precio_usd,null);
});
test('kept photos take priority and unphotographed colors do not inherit the other color',()=>{
  const kept=serializeVariant({...v,imagenes:['images/5011_0.jpg']},context);
  assert.deepEqual(kept.imagenes,[context.assetUrl('images/5011_0.jpg')]);
  assert.equal(kept.imagen_ilustrativa,false);
  const p=serializeProduct({imagen:null,variantes:[{...v,codigo:'1751'},{...v,codigo:'1752'}]},context);
  assert.equal(p.imagen,null);
  assert.deepEqual(p.variantes[1].imagenes,[]);
  assert.ok(p.variantes[0].imagenes.length);
});
test('reference photos are labeled and every asset matches its recorded bytes and hash',()=>{
  const reference=serializeVariant({...v,codigo:'1241'},context);assert.equal(reference.imagen_ilustrativa,true);
  const excluded=new Set(excludedImagePaths);
  for(const [path,asset] of Object.entries(replacementAssets)){
    assert.equal(excluded.has(path),false);
    const bytes=readFileSync(new URL('../public/'+path,import.meta.url));
    assert.equal(bytes.length,asset.bytes,path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,path);
  }
});
