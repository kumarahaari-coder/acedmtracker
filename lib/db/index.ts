import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/neondb";

// 1. Stateless HTTP driver for zero-overhead simple reads and single queries
const sql = neon(databaseUrl);
export const db = drizzleHttp(sql, { schema });

/**
 * 2. Scoped Transactional & RLS Execution Driver
 * Opens a dedicated connection, executes SET LOCAL for session context,
 * runs the provided work within an atomic transaction, and reliably disposes the connection.
 */
export async function withUserContext<T>(
  userId: string,
  orgId: string,
  callback: (tx: ReturnType<typeof drizzleWs<typeof schema>>) => Promise<T>
): Promise<T> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN;");
    await client.query("SELECT set_config('app.current_user_id', $1, true);", [userId]);
    await client.query("SELECT set_config('app.current_org_id', $2, true);", [orgId]);

    const txDb = drizzleWs(client as any, { schema });
    const result = await callback(txDb);

    await client.query("COMMIT;");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // Ignore rollback failure on already aborted connections
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
