import { db } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/uploads";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ZipArchive } from "archiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_DIR = path.dirname(UPLOAD_DIR); // <project>/db
const DB_PATH = path.join(DB_DIR, "custom.db");
const META_PATH = path.join(DB_DIR, "backup-meta.json");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function backupStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

// GET /api/backup — stream a full backup ZIP (database + uploaded documents)
export async function GET() {
  try {
    // 1. Flush SQLite WAL so the copied db file contains every committed row
    // (wal_checkpoint returns a result row → must use $queryRawUnsafe, not $executeRawUnsafe)
    try {
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (err) {
      console.warn("WAL checkpoint failed (continuing):", err);
    }

    // 2. Collect upload files (skip dotfiles / restore artifacts / meta)
    let uploadFiles: string[] = [];
    try {
      uploadFiles = fs
        .readdirSync(UPLOAD_DIR, { withFileTypes: true })
        .filter((e) => {
          if (!e.isFile()) return false; // skips .restore-* / .old-* dirs
          if (e.name.startsWith(".")) return false; // dotfiles
          if (e.name.includes(".restore-tmp")) return false;
          if (e.name === "backup-meta.json") return false;
          return true;
        })
        .map((e) => e.name);
    } catch (err) {
      console.warn("uploads listing failed (continuing):", err);
    }

    // 3. Record the backup time BEFORE streaming starts
    const now = new Date();
    try {
      fs.writeFileSync(
        META_PATH,
        JSON.stringify({ lastBackupAt: now.toISOString() }, null, 2)
      );
    } catch (err) {
      console.warn("backup-meta write failed (continuing):", err);
    }

    // 4. Build the ZIP stream
    // archiver v8 is ESM: ZipArchive is itself the readable Transform stream
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("warning", (err) => console.warn("archiver warning:", err));
    archive.on("error", (err) => console.error("archiver error:", err));

    archive.file(DB_PATH, { name: "db/custom.db" });
    for (const name of uploadFiles) {
      archive.file(path.join(UPLOAD_DIR, name), { name: `db/uploads/${name}` });
    }

    void archive.finalize().catch((err) => console.error("archiver finalize:", err));

    const body = Readable.toWeb(
      archive as unknown as import("stream").Readable
    ) as unknown as ReadableStream<Uint8Array>;

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="BCS-Notebook-Backup-${backupStamp(now)}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/backup error:", error);
    return Response.json(
      { error: "ব্যাকআপ তৈরি করা যায়নি — আবার চেষ্টা করুন" },
      { status: 500 }
    );
  }
}
