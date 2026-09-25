import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("\n  DATABASE_URL is not set.\n  Copy .env.example to .env.local and fill it in.\n");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 1 });
  const sql = readFileSync(path.join(root, "db", "seed.sql"), "utf8");

  try {
    const res = await pool.query(sql);
    console.log(`✓ seed inserted ${res.rowCount ?? 0} rows`);
  } catch (err) {
    console.error("✗ seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
