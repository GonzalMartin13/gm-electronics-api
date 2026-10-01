import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makePool } from '../src/config.js';
const pool=makePool({admin:true}), client=await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(694834)');
  await client.query('CREATE TABLE IF NOT EXISTS public.gm_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL)');
  for (const name of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
    const sql=await readFile(new URL('../database/migrations/'+name,import.meta.url),'utf8');
    const sha=createHash('sha256').update(sql).digest('hex');
    const {rows}=await client.query('SELECT sha256 FROM public.gm_schema_migrations WHERE name=$1',[name]);
    if (rows.length) { if (rows[0].sha256!==sha) throw new Error('Migration changed: '+name); continue; }
    // Adopt the verified local installation created before this runner existed.
    const existing=await client.query("SELECT to_regclass('gm.products') AS catalog");
    if (!(name==='001_catalog.sql' && existing.rows[0].catalog)) await client.query(sql);
    await client.query('INSERT INTO public.gm_schema_migrations VALUES ($1,$2)',[name,sha]);
    console.log('Migration ready:',name);
  }
  await client.query('COMMIT');
} catch(error) { await client.query('ROLLBACK'); console.error('Migration failed:',error.code||error.message); process.exitCode=1; }
finally {client.release();await pool.end();}
