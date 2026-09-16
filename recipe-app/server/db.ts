import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ConnectionOptions } from 'node:tls';
import { fileURLToPath } from 'node:url';
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
 * The project CA ships in the image rather than in an environment variable.
 * It is a CA's public certificate — Aiven publishes it for clients to pin, so
 * there is nothing secret to leak — and keeping it out of the service config
 * avoids a ~2 kB value there, which is what the deploy appears to choke on.
 */
const bundledCa = (): string | null => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/server/db.js at runtime, server/db.ts under tsx in development.
  for (const candidate of ['../../aiven-ca.pem', '../aiven-ca.pem']) {
    try {
      return readFileSync(path.join(here, candidate), 'utf8');
    } catch {
      // Try the next layout.
    }
  }
  return null;
};

/**
 * Aiven Postgres presents a certificate signed by a per-project CA that the
 * system trust store does not know, so the CA has to be supplied explicitly.
 * The environment variables still win, so a rotated CA can be swapped in
 * without a rebuild.
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

  const bundled = bundledCa();
  if (bundled) {
    return { ca: bundled };
  }

  // Only reachable in local development, and only when asked for explicitly,
  // so a misconfigured deploy fails loudly instead of skipping verification.
  if (process.env.ALLOW_INSECURE_DB_TLS === 'true') {
    return { rejectUnauthorized: false };
  }

  throw new Error(
    'No database CA certificate available. Expected aiven-ca.pem beside the ' +
      'app, or PROJECT_CA_CERT (base64) or DATABASE_CA_CERT (PEM) in the ' +
      'environment, or ALLOW_INSECURE_DB_TLS=true for local use.',
  );
};

export const pool = new pg.Pool({
  connectionString: connectionString(),
  ssl: ssl(),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
