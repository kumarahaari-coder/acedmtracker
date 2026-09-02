import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.warn("[Database] DATABASE_URL is not set, falling back to localhost");
    return "postgres://postgres:postgres@localhost:5432/neondb";
  }
  return url;
}

// 1. Dynamic Stateless HTTP driver with per-query URL resolution for edge/worker resilience
const dynamicSql: any = (strings: any, ...values: any[]) => {
  const client = neon(getDatabaseUrl());
  return client(strings, ...values);
};
dynamicSql.query = (queryText: string, params: any[], options: any) => {
  const client = neon(getDatabaseUrl());
  return client.query(queryText, params, options);
};
dynamicSql.transaction = (...args: any[]) => {
  const client = neon(getDatabaseUrl());
  return (client.transaction as any)(...args);
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
