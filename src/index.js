import { createApp } from './app.js';
import { Catalog } from './catalog.js';
import { makePool, config } from './config.js';

export const pool=makePool();
pool.on('error',error=>console.error({code:error.code,message:'Database connection error'}));
export const app=createApp({catalog:new Catalog(pool),config});
export default app;
