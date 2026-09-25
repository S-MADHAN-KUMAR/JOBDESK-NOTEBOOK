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
  const sql = readFileSync(path.join(root, "db", "schema.sql"), "utf8");

  try {
    await pool.query(sql);
    console.log("✓ schema applied");
  } catch (err) {
    console.error("✗ schema failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
