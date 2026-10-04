import {readFileSync} from 'node:fs';

const review=JSON.parse(readFileSync(new URL('../data/photo-exclusions.json',import.meta.url),'utf8'));
const paths=review.excluded_paths;
if(!Array.isArray(paths)||paths.length!==review.total_removed||paths.some(path=>typeof path!=='string'||!/^images\/[A-Za-z0-9_.-]+$/.test(path)))throw new Error('Invalid photo review');
const excluded=new Set(paths);
if(excluded.size!==paths.length)throw new Error('Duplicate photo exclusions');

export const excludedImagePaths=Object.freeze([...excluded]);
export function isExcludedImage(path){return excluded.has(path);}
export function visibleImages(paths=[]){return paths.filter(path=>!isExcludedImage(path));}
