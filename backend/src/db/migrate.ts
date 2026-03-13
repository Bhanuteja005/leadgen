import { pool } from "./pool";
import { SCHEMA_SQL } from "./schema";

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log("[db] Schema up to date");
  } finally {
    client.release();
  }
}
