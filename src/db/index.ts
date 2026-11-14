import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { readDatabaseUrl } from "@/lib/config";
import * as schema from "./schema";

export type Database = NeonDatabase<typeof schema>;

export async function withDatabase<T>(
  callback: (database: Database) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: readDatabaseUrl(),
    max: 1,
  });
  pool.on("error", () => {
    console.error("Database connection error");
  });

  const database = drizzle(pool, { schema });

  try {
    return await callback(database);
  } finally {
    await pool.end();
  }
}
