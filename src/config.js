import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

dotenv.config({ path: fileURLToPath(new URL('../.env.local', import.meta.url)), quiet: true });
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

export function makePool({ admin = false } = {}) {
  const connectionString = admin ? process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL : process.env.DATABASE_URL;
  const sslMode = process.env.PGSSLMODE;
  const options = {
    ...(connectionString ? { connectionString } : {}),
    max: Number(process.env.PGPOOL_MAX || 5),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: admin ? 120000 : 10000,
    application_name: admin ? 'gm-electronics-migrations' : 'gm-electronics-api',
  };
  if (sslMode === 'require' || sslMode === 'verify-full') options.ssl = { rejectUnauthorized: true };
  if (sslMode === 'disable') options.ssl = false;
  return new pg.Pool(options);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(x => x.trim()).filter(Boolean),
  adminKey: process.env.ADMIN_API_KEY || '',
  exposeSupplierPrices: process.env.EXPOSE_SUPPLIER_PRICES !== 'false',
};

