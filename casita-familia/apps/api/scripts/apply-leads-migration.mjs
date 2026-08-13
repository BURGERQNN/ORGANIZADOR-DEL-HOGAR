import "dotenv/config";
import postgres from "postgres";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbPass = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";
const ref = "bvarujfbnhfapzfmffue";
const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  join(__dirname, "../../../supabase/migrations/20260813150000_leads.sql"),
  "utf8",
);

const candidates = [];
if (dbPass) {
  candidates.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encodeURIComponent(dbPass)}@db.${ref}.supabase.co:5432/postgres`,
  );
}
if (secret) {
  candidates.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(secret)}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encodeURIComponent(secret)}@db.${ref}.supabase.co:5432/postgres`,
  );
}

let connected = null;
for (const url of candidates) {
  const host = url.split("@")[1];
  try {
    const sql = postgres(url, { ssl: "require", connect_timeout: 10, max: 1 });
    await sql`select 1 as ok`;
    console.log("CONNECTED", host);
    connected = sql;
    break;
  } catch (e) {
    console.log("FAIL", host, String(e.message).slice(0, 160));
  }
}

if (!connected) {
  console.error("NO_DB_CONNECTION");
  process.exit(2);
}

try {
  await connected.unsafe(migration);
  console.log("MIGRATION_OK");
  const rows = await connected`select to_regclass('public.leads') as t`;
  console.log("leads_table", rows[0].t);
} catch (e) {
  console.error("MIGRATION_FAIL", e.message);
  process.exit(1);
} finally {
  await connected.end();
}
