import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const encoded=await readFile(new URL('../data/fastec190-images.json.gz.b64',import.meta.url),'utf8');
const assets=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')).toString('utf8'));
if(Object.keys(assets).length!==58)throw new Error('Unexpected Fastec190 asset count');
for(const [path,base64] of Object.entries(assets)){
 if(!/^images\/f190-\d{4}-[a-f0-9]{10}\.jpg$/.test(path))throw new Error('Invalid Fastec190 image path');
 const bytes=Buffer.from(base64,'base64'),hash=createHash('sha256').update(bytes).digest('hex');
 if(!path.endsWith('-'+hash.slice(0,10)+'.jpg'))throw new Error('Fastec190 image hash mismatch');
 const destination=new URL('../public/'+path,import.meta.url);
 await mkdir(new URL('.',destination),{recursive:true});await writeFile(destination,bytes);
}
console.log('Fastec190: 58 verified product images prepared.');
