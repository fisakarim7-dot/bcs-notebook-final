import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { list } from "@vercel/blob";
import { db } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free-tier limits (bytes). Overridable via env when the user upgrades.
const DB_LIMIT = Number(process.env.STORAGE_DB_LIMIT_BYTES ?? 512 * 1024 * 1024); // Neon free: 0.5 GB
const BLOB_LIMIT = Number(
  process.env.STORAGE_BLOB_LIMIT_BYTES ?? 1024 * 1024 * 1024
); // Vercel Blob hobby: ~1 GB

const isPostgres = /^postgres(ql)?:(\/\/|[^/])/i.test(
  (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL ??
    ""
  ).trim()
);
const isCloudFiles = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// Cache the blob listing briefly — list() counts as a billable "advanced"
// operation on Vercel Blob, so we never want to call it on every render.
let blobCache: { at: number; usedBytes: number; fileCount: number } | null =
  null;
const BLOB_CACHE_MS = 5 * 60 * 1000;

async function dbSizeBytes(): Promise<number> {
  if (isPostgres) {
    const rows = await db.$queryRaw<Array<{ size: bigint }>>`
      SELECT pg_database_size(current_database()) AS size
    `;
    return Number(rows[0]?.size ?? 0);
  }
  // Local SQLite — the file itself is the database.
  const file = path.resolve(process.cwd(), "db", "custom.db");
  try {
    return (await fsp.stat(file)).size;
  } catch {
    return 0;
  }
}

async function localUploadsBytes(): Promise<{ usedBytes: number; fileCount: number }> {
  let usedBytes = 0;
  let fileCount = 0;
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        fileCount++;
        try {
          usedBytes += (await fsp.stat(full)).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(UPLOAD_DIR);
  return { usedBytes, fileCount };
}

async function blobUsage(): Promise<{ usedBytes: number; fileCount: number }> {
  const now = Date.now();
  if (blobCache && now - blobCache.at < BLOB_CACHE_MS) return blobCache;
  let usedBytes = 0;
  let fileCount = 0;
  let cursor: string | undefined;
  // Safety cap: 20 pages × 1000 blobs is far beyond a personal app.
  for (let page = 0; page < 20; page++) {
    const res = await list({ cursor, limit: 1000 });
    for (const b of res.blobs) {
      usedBytes += b.size;
      fileCount++;
    }
    if (!res.hasMore) break;
    cursor = res.cursor;
  }
  blobCache = { at: now, usedBytes, fileCount };
  return blobCache;
}

// GET /api/storage-usage — how much of the free storage is used
export async function GET() {
  try {
    const [dbBytes, files] = await Promise.all([
      dbSizeBytes(),
      isCloudFiles ? blobUsage() : localUploadsBytes(),
    ]);
    return NextResponse.json({
      db: {
        usedBytes: dbBytes,
        // Local SQLite is limited only by the user's own disk → no cap.
        limitBytes: isPostgres ? DB_LIMIT : null,
        mode: isPostgres ? "postgres" : "sqlite",
      },
      files: {
        usedBytes: files.usedBytes,
        fileCount: files.fileCount,
        limitBytes: isCloudFiles ? BLOB_LIMIT : null,
        mode: isCloudFiles ? "blob" : "local",
      },
      cachedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/storage-usage error:", error);
    return NextResponse.json(
      { error: "স্টোরেজ ব্যবহার মাপা যায়নি" },
      { status: 500 }
    );
  }
}
