import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Builds the mssql connection config from environment variables.
 * Windows Authentication (Trusted Connection) is used when DB_USER / DB_PASSWORD
 * are absent.  Set them in .env for SQL Server auth instead.
 */
function buildConfig(): sql.config {
  const server = process.env.DB_SERVER;
  const database = process.env.DB_DATABASE;

  if (!server || !database) {
    throw new Error('DB_SERVER and DB_DATABASE must be set in the environment.');
  }

  const useWindowsAuth = !process.env.DB_USER && !process.env.DB_PASSWORD;

  const base: sql.config = {
    server,
    database,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true',
      // trustedConnection enables Windows / Kerberos auth
      trustedConnection: useWindowsAuth,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };

  if (!useWindowsAuth) {
    base.user = process.env.DB_USER;
    base.password = process.env.DB_PASSWORD;
  }

  return base;
}

// Singleton connection pool — shared across the application.
let pool: sql.ConnectionPool | null = null;

/**
 * Returns the shared connection pool, creating it on the first call.
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  pool = await new sql.ConnectionPool(buildConfig()).connect();

  pool.on('error', (err) => {
    console.error('[db] Pool error:', err);
    pool = null;
  });

  return pool;
}

/**
 * Gracefully closes the connection pool.
 * Call this on application shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export { sql };
