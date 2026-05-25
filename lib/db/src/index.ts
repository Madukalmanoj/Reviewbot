import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "[reviewbot] DATABASE_URL is not set. Database operations will fail at runtime. " +
    "Provision a free DB at https://neon.tech or https://supabase.com"
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "" });
export const db = drizzle(pool, { schema });

export * from "./schema";
