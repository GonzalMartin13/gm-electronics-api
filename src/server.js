import { app, pool } from './index.js';
import { config } from './config.js';

const server=app.listen(config.port,config.host,()=>console.log(`GM Electronics API listening on port ${config.port}`));
server.requestTimeout=30000;
server.headersTimeout=10000;
async function stop() {
  server.close(async ()=>{ await pool.end(); process.exit(0); });
  setTimeout(()=>process.exit(1),10000).unref();
}
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
