#!/usr/bin/env node
// One command database setup (FRD F13.2): runs every migration in order, once, then the seed data.
//   DATABASE_URL="postgresql://..." npm run db:setup            (migrations + sample business)
//   DATABASE_URL="postgresql://..." npm run db:setup -- --no-seed
// Find DATABASE_URL in Supabase: Connect (top bar), then "Session pooler" connection string.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first (Supabase: Connect, Session pooler connection string).");
  process.exit(1);
}
const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });

await client.connect();
await client.query("create table if not exists citedesk_migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query("select name from citedesk_migrations")).rows.map((r) => r.name));
for (const f of files) {
  if (done.has(f)) {
    console.log(`skip   ${f} (already applied)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into citedesk_migrations(name) values ($1)", [f]);
    await client.query("commit");
    console.log(`apply  ${f}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`failed ${f}: ${e.message}`);
    console.error("If you already ran this file by hand in the SQL Editor, record it with:");
    console.error(`  insert into citedesk_migrations(name) values ('${f}');`);
    process.exit(1);
  }
}
if (!process.argv.includes("--no-seed")) {
  await client.query(fs.readFileSync(path.join(process.cwd(), "supabase", "seed.sql"), "utf8"));
  console.log("seed   sample business: /help/sample-bakery");
}
await client.end();
console.log("Database ready.");
