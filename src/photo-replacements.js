import {readFileSync} from 'node:fs';
import {isExcludedImage,visibleImages} from './photo-review.js';

const manifest=JSON.parse(readFileSync(new URL('../data/photo-replacements.json',import.meta.url),'utf8'));
export const photoReplacements=Object.freeze(manifest.by_code);
export const replacementAssets=Object.freeze(manifest.assets);
for(const [code,row] of Object.entries(photoReplacements)){
  if(!/^\d{4}$/.test(code)||!/^images\/web-\d{4}-v1\.(jpg|png|webp)$/.test(row.path)||!replacementAssets[row.path]||typeof row.illustrative!=='boolean')throw new Error('Invalid curated photo: '+code);
}

// Curated images supplement empty galleries; existing reviewed photos take priority.
export function supplementalPhoto(variant){
  if(visibleImages(variant.imagenes||[]).length)return null;
  const extra=photoReplacements[String(variant.codigo).trim().padStart(4,'0')];
  return extra&&!isExcludedImage(extra.path)?extra:null;
}
export function variantPhotoPaths(variant){
  const paths=visibleImages(variant.imagenes||[]);
  const extra=paths.length?null:supplementalPhoto(variant);
  return extra?[extra.path]:paths;
}
export function productPhoto(product){
  if(product.imagen&&!isExcludedImage(product.imagen))return {path:product.imagen,illustrative:false};
  // A partially photographed color range must not show another color as its fallback.
  const extras=product.variantes.map(supplementalPhoto);
  return extras.length&&extras.every(Boolean)?extras[0]:null;
}
