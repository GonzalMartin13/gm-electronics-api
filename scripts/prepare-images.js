import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
const manifest=JSON.parse(await readFile(new URL('../data/image-manifest.json',import.meta.url),'utf8'));
const commit='72c99a6b911a437d65687c8ae8210bc675f1e3e0';
const response=await fetch(`https://codeload.github.com/GonzalMartin13/gm-electronics/zip/${commit}`,{signal:AbortSignal.timeout(120000)});
if(!response.ok)throw new Error('Image source download failed');
const zip=new AdmZip(Buffer.from(await response.arrayBuffer()));
const entries=new Map(zip.getEntries().map(e=>[e.entryName.split('/').slice(1).join('/'),e]));
for(const [path,sha]of Object.entries(manifest)){
 if(!path.startsWith('images/') || path.includes('\\') || path.split('/').some(segment=>!segment || segment==='.' || segment==='..'))throw new Error('Invalid image path');
 const entry=entries.get(path);if(!entry)throw new Error('Missing image: '+path);
 const bytes=entry.getData();if(createHash('sha256').update(bytes).digest('hex')!==sha)throw new Error('Image checksum mismatch: '+path);
 const destination=new URL('../public/'+path,import.meta.url);await mkdir(new URL('.',destination),{recursive:true});await writeFile(destination,bytes);
}
console.log('Verified images prepared:',Object.keys(manifest).length);
