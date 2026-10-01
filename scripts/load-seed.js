import {readFile,readdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {makePool} from '../src/config.js';
const pool=makePool({admin:true});
try {
  let contents;
  try { contents=await readFile(new URL('../database/generated/seed.sql',import.meta.url),'utf8'); }
  catch(error) {if(error.code!=='ENOENT')throw error;const directory=new URL('../data/',import.meta.url);const parts=(await readdir(directory)).filter(n=>/^seed-part-\d+\.b64$/.test(n)).sort();if(!parts.length)throw new Error('Packaged seed missing');let encoded='';for(const part of parts)encoded+=await readFile(new URL(part,directory),'utf8');contents=gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');}
  const sql=contents.replace(/^\\set[^\r\n]*[\r\n]+/gm,'');
  await pool.query(sql);
  const result=await pool.query('SELECT count(*)::int AS productos FROM gm.products');
  console.log('Catalog imported:',result.rows[0].productos);
} catch(error) {console.error('Import failed:',error.code||error.message);process.exitCode=1;}
finally {await pool.end();}
