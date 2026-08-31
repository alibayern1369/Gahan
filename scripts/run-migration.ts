/**
 * Run a single migration file against Supabase Postgres.
 * Requires DATABASE_URL in .env.local, e.g.:
 *   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: ".env.local", quiet: true });

const file = process.argv[2] ?? "supabase/migrations/0008_leave_holidays_backup.sql";
const url = process.env.DATABASE_URL;
const refMatch = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/);
const ref = refMatch?.[1];

const candidates: string[] = [];
if (url) candidates.push(url);
if (ref && process.env.SUPABASE_DB_PASSWORD) {
  candidates.push(
    `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`
  );
  candidates.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
  );
}

if (candidates.length === 0) {
  console.error("❌ DATABASE_URL یا SUPABASE_DB_PASSWORD در .env.local تنظیم نشده است.");
  process.exit(1);
}

const sql = readFileSync(resolve(file), "utf8");

async function main() {
  let lastErr: Error | null = null;
  for (const conn of candidates) {
    const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log("✓ اتصال برقرار شد");
      await client.query(sql);
      console.log(`✓ مایگریشن ${file} با موفقیت اجرا شد`);
      await client.end();
      return;
    } catch (e) {
      lastErr = e as Error;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  console.error("❌ اجرای مایگریشن ناموفق:", lastErr?.message);
  process.exit(1);
}

main();
