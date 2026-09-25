import { Pool, type PoolClient } from "pg";

/**
 * One Pool per process, cached on globalThis so Next.js dev-server module
 * reloads don't leak connections.
 */
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is missing. Add it to .env.local — see .env.example. " +
          "Use your Neon pooled connection string for production."
      );
    }

    globalForDb.__pgPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Neon terminates idle connections; never treat that as a crash.
      allowExitOnIdle: false,
    });
  }

  return globalForDb.__pgPool;
}

/** Run a single parameterised query. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** Run several statements inside one transaction. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
