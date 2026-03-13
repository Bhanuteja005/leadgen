import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { Pool, QueryResultRow } from "pg";

// Load .env from the first path that exists, regardless of CWD or __dirname quirks.
const envCandidates = [
  path.resolve(__dirname, "../../.env"),          // ts-node: src/db → backend/.env
  path.resolve(__dirname, "../../../backend/.env"),// compiled dist/db → backend/.env
  path.resolve(process.cwd(), ".env"),             // if run from backend/
  path.resolve(process.cwd(), "backend/.env"),     // if run from project root
];
const envPath = envCandidates.find(p => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log("[db] Loaded env from:", envPath);
} else {
  console.warn("[db] No .env file found — DATABASE_URL must be set in environment");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) {
  const client = await pool.connect();
  try {
    const result = await client.query<T>(sql, params);
    return result;
  } finally {
    client.release();
  }
}
