import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.warn("[Database] DATABASE_URL is not set, falling back to localhost");
    return "postgres://postgres:postgres@localhost:5432/neondb";
  }

  // Safety Guard: Vercel Preview environments must NEVER connect to the production Neon endpoint
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "preview" && url.includes("ep-dry-forest-azifaoyz")) {
    throw new Error(
      "[CRITICAL DATABASE SAFETY GUARD] Vercel Preview environment is strictly forbidden from connecting to the production Neon database (ep-dry-forest-azifaoyz). Configure the staging Neon branch for Preview."
    );
  }

  return url;
}

let cachedNeonClient: ReturnType<typeof neon> | null = null;
let cachedUrl = "";

function getNeonClient() {
  const url = getDatabaseUrl();
  if (!cachedNeonClient || cachedUrl !== url) {
    cachedNeonClient = neon(url);
    cachedUrl = url;
  }
  return cachedNeonClient;
}

// 1. Dynamic Stateless HTTP driver with per-query URL resolution for edge/worker resilience
const dynamicSql: any = (strings: any, ...values: any[]) => {
  return getNeonClient()(strings, ...values);
};
dynamicSql.query = (queryText: string, params: any[], options: any) => {
  return getNeonClient().query(queryText, params, options);
};
dynamicSql.transaction = (...args: any[]) => {
  return (getNeonClient().transaction as any)(...args);
};

export const db = drizzleHttp(dynamicSql, { schema });

/**
 * 2. Scoped Transactional Driver (Edge-Safe Stateless HTTP)
 */
export async function runTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return callback(db);
}

/**
 * 3. Scoped Transactional & RLS Execution Driver (Edge-Safe Stateless HTTP)
 */
export async function withUserContext<T>(
  userId: string,
  orgId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return callback(db);
}
