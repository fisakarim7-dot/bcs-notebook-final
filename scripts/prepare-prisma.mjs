#!/usr/bin/env node
/**
 * Chooses the Prisma schema + generates the client for the current environment.
 *
 *  - sqlite     → prisma/schema.prisma            (laptop / offline)
 *  - postgres   → prisma/schema.postgres.prisma    (Vercel / Neon)
 *
 * The postgres variant is DERIVED from schema.prisma (only the datasource
 * provider changes), so future schema edits happen in ONE file and both
 * environments stay in sync automatically. This keeps "add a feature later"
 * trivial: edit schema.prisma, redeploy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "prisma", "schema.prisma");
const PG = path.join(ROOT, "prisma", "schema.postgres.prisma");

function loadDotEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const url = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NO_SSL ||
  ""
).trim();
const isPostgres = /^postgres(ql)?:(\/\/|[^/])/i.test(url);

const cli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");

let schemaPath = SRC;
if (isPostgres) {
  let text = fs.readFileSync(SRC, "utf8");
  if (!/provider\s*=\s*"sqlite"/.test(text)) {
    console.log("[prepare-prisma] schema.prisma is not sqlite-based; using as-is.");
  } else {
    text = text.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  }
  fs.writeFileSync(PG, text);
  schemaPath = PG;
  console.log("[prepare-prisma] CLOUD mode → postgres client from schema.postgres.prisma");
} else {
  console.log("[prepare-prisma] LOCAL mode → sqlite client from schema.prisma");
}

const rel = path.relative(ROOT, schemaPath);
const res = spawnSync(process.execPath, [cli, "generate", "--schema", rel], {
  cwd: ROOT,
  stdio: "inherit",
});
process.exit(res.status ?? 0);
