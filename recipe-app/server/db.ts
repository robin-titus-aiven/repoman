import type { ConnectionOptions } from 'node:tls';
import pg from 'pg';

/**
 * node-postgres silently ignores the `ssl` option when the connection string
 * carries an `sslmode` parameter, which would drop the CA below and fail
 * verification against Aiven's project certificate. Stripping it is the
 * documented workaround, not a downgrade — TLS is still enforced by `ssl`.
 */
const connectionString = (): string => {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  return url.toString();
};

/**
 * Aiven Postgres presents a certificate signed by a per-project CA that the
 * system trust store does not know, so the CA has to be supplied explicitly.
 * The deploy injects it as base64 in `PROJECT_CA_CERT`.
 */
const ssl = (): ConnectionOptions => {
  const injected = process.env.PROJECT_CA_CERT;
  if (injected) {
    return { ca: Buffer.from(injected, 'base64').toString('utf8') };
  }

  const pem = process.env.DATABASE_CA_CERT;
  if (pem) {
    return { ca: pem };
  }

  // Only reachable in local development, and only when asked for explicitly,
  // so a misconfigured deploy fails loudly instead of skipping verification.
  if (process.env.ALLOW_INSECURE_DB_TLS === 'true') {
    return { rejectUnauthorized: false };
  }

  throw new Error(
    'No database CA certificate available. Set PROJECT_CA_CERT (base64) or ' +
      'DATABASE_CA_CERT (PEM), or set ALLOW_INSECURE_DB_TLS=true for local use.',
  );
};

export const pool = new pg.Pool({
  connectionString: connectionString(),
  ssl: ssl(),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
