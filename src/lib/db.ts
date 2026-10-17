import path from "path";
import { PrismaClient } from "@prisma/client";

/**
 * Two database modes:
 *
 *  - LOCAL  (default): SQLite at <project>/db/custom.db — the original offline
 *    behaviour. We force an absolute `file:` URL so the Prisma CLI (which
 *    resolves relative to prisma/) and Next.js (which resolves relative to cwd)
 *    never point at different files.
 *  - CLOUD: when `DATABASE_URL` is a postgres:// or postgresql:// connection
 *    string (e.g. Neon via Vercel), we leave it untouched and use it as-is.
 *    The generated Prisma client for that mode is produced from
 *    prisma/schema.postgres.prisma by scripts/prepare-prisma.mjs.
 */
function isPostgresUrl(url: string | undefined): boolean {
  return /^postgres(ql)?:(\/\/|[^/])/i.test((url ?? "").trim());
}

function resolveSqliteUrl(): string {
  const abs = path.resolve(process.cwd(), "db", "custom.db").replace(/\\\\/g, "/");
  return `file:${abs}`;
}

// Neon (Vercel) sets POSTGRES_PRISMA_URL / POSTGRES_URL rather than DATABASE_URL.
// Accept any of them so cloud works with zero manual env mapping.
const candidates = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL,
  process.env.POSTGRES_URL_NO_SSL,
].filter((u): u is string => typeof u === "string" && u.trim().length > 0);

// Neon gives you two endpoints: a direct one and a pooled one (host contains
// "-pooler"). A serverless function opens its own connection per instance, so
// the POOLED endpoint is the right choice on Vercel — it connects faster and
// does not exhaust Neon's direct-connection limit. Prefer it when available.
const isPooled = (u: string) => /-pooler\./i.test(u);
const providedUrl = (candidates.find(isPooled) ?? candidates[0] ?? "").trim();

if (isPostgresUrl(providedUrl)) {
  process.env.DATABASE_URL = providedUrl;
} else {
  process.env.DATABASE_URL = resolveSqliteUrl();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? [] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
