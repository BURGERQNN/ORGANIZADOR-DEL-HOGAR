import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbPass = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";
const ref = "bvarujfbnhfapzfmffue";

const candidates = [];
if (dbPass) {
  candidates.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encodeURIComponent(dbPass)}@db.${ref}.supabase.co:5432/postgres`,
  );
}
candidates.push(
  `postgresql://postgres.${ref}:${encodeURIComponent(secret)}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${encodeURIComponent(secret)}@db.${ref}.supabase.co:5432/postgres`,
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../../../supabase/migrations/20260810190000_casita_familia_full.sql",
);
const migration = readFileSync(migrationPath, "utf8");

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
    console.log("FAIL", host, String(e.message).slice(0, 140));
  }
}

if (!connected) {
  console.error("NO_DB_CONNECTION");
  process.exit(2);
}

try {
  await connected.unsafe(migration);
  console.log("MIGRATION_OK");
  const tables = await connected`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  `;
  console.log("TABLES", tables.map((t) => t.table_name).join(", "));
} catch (e) {
  console.error("MIGRATION_FAIL", e.message);
  process.exit(1);
} finally {
  await connected.end();
}
