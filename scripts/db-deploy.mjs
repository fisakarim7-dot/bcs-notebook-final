#!/usr/bin/env node
/**
 * Applies the DB schema at build/deploy time (Vercel).
 *  - CLOUD (postgres): runs `prisma db push` against DATABASE_URL so tables
 *    exist before `next build` finishes. Refuses destructive changes unless
 *    DB_DEPLOY_ACCEPT_DATA_LOSS=1 (safe default).
 *  - LOCAL (sqlite): no-op — the laptop launcher already manages its own DB.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadDotEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const url = (process.env.DATABASE_URL || "").trim();
if (!/^postgres(ql)?:(\/\/|[^/])/i.test(url)) {
  console.log("[db-deploy] not postgres → skipping (local SQLite mode).");
  process.exit(0);
}

const schema = path.join(ROOT, "prisma", "schema.postgres.prisma");
if (!fs.existsSync(schema)) {
  console.error("[db-deploy] schema.postgres.prisma missing — run scripts/prepare-prisma.mjs first.");
  process.exit(1);
}

const args = [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "db", "push", "--schema", path.relative(ROOT, schema), "--skip-generate"];
if (process.env.DB_DEPLOY_ACCEPT_DATA_LOSS === "1") args.push("--accept-data-loss");

console.log("[db-deploy] pushing postgres schema…");
const res = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
process.exit(res.status ?? 0);
