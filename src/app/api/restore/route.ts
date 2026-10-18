import { db } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/uploads";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 2 * 1024 * 1024 * 1024; // 2 GB
const DB_DIR = path.dirname(UPLOAD_DIR); // <project>/db
const DB_PATH = path.join(DB_DIR, "custom.db");

function sanitizeName(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  if (!cleaned || cleaned.startsWith(".")) return `file_${Date.now()}`;
  return cleaned;
}

function uniqueName(dir: string, name: string): string {
  let candidate = name;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    candidate = `${stem}-${i}${ext}`;
    i++;
  }
  return candidate;
}

const LOCK_CODES = new Set(["EBUSY", "EPERM", "EACCES", "EMFILE"]);

/** Windows-safe rename: antivirus/indexer may briefly lock files — retry, then fall back to copy+unlink */
async function renameWithRetry(src: string, dest: string, attempts = 6, delayMs = 350): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fsp.rename(src, dest);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!LOCK_CODES.has(code) || i === attempts - 1) {
        // final fallback: copy + unlink (works when rename is blocked by the OS)
        try {
          await fsp.copyFile(src, dest);
          await fsp.rm(src, { force: true });
          return;
        } catch {
          throw err;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function rmWithRetry(target: string, attempts = 4, delayMs = 300): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fsp.rm(target, { force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!LOCK_CODES.has(code) || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// POST /api/restore — replace db + uploads with the contents of a backup ZIP
export async function POST(request: Request) {
  let tmpDbPath: string | null = null;
  let stagingDir: string | null = null;
  let oldDbPath: string | null = null;

  try {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return Response.json(
        { error: "ফর্ম ডেটা পাওয়া যায়নি — ZIP ফাইল আপলোড করুন" },
        { status: 400 }
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "ফাইল পাওয়া যায়নি — সঠিক ব্যাকআপ ZIP দিন" },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD) {
      return Response.json(
        { error: "ফাইলটি 2GB-এর বেশি — সঠিক ব্যাকআপ ZIP দিন" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      return Response.json(
        { error: "ZIP ফাইলটি পড়া যায়নি — সঠিক ব্যাকআপ ZIP দিন" },
        { status: 400 }
      );
    }

    // ---- Locate the database entry inside the ZIP ----
    let dbEntryName: string | null = null;
    const uploadEntries: string[] = [];

    for (const entryName of Object.keys(zip.files)) {
      const entry = zip.files[entryName];
      if (entry.dir) continue;
      if (entryName.includes("__MACOSX")) continue;
      const base = entryName.split(/[\\/]/).pop() ?? "";
      if (base === ".DS_Store" || base === ".gitkeep" || base.startsWith(".")) continue;

      const isWal = entryName.endsWith("custom.db-wal") || entryName.endsWith("custom.db-shm");
      if (isWal) continue;

      if (entryName === "db/custom.db") {
        dbEntryName = entryName; // preferred exact match
      } else if (!dbEntryName && entryName.endsWith("custom.db")) {
        dbEntryName = entryName;
      }

      if (/(^|\/)uploads\/.+/.test(entryName)) {
        uploadEntries.push(entryName);
      }
    }

    if (!dbEntryName) {
      return Response.json(
        { error: "এই ফাইলে ডেটাবেইজ পাওয়া যায়নি — সঠিক ব্যাকআপ ZIP দিন" },
        { status: 400 }
      );
    }

    // ---- Extract database to a tmp file ----
    tmpDbPath = `${DB_PATH}.restore-tmp`;
    const dbBuffer = await zip.files[dbEntryName].async("nodebuffer");
    await fsp.writeFile(tmpDbPath, dbBuffer);

    // ---- Extract uploads to a flat staging folder ----
    stagingDir = path.join(UPLOAD_DIR, `.restore-${Date.now()}`);
    await fsp.mkdir(stagingDir, { recursive: true });

    let restoredFiles = 0;
    for (const entryName of uploadEntries) {
      const entry = zip.files[entryName];
      const safe = uniqueName(stagingDir, sanitizeName(entryName));
      const out = await entry.async("nodebuffer");
      await fsp.writeFile(path.join(stagingDir, safe), out);
      restoredFiles++;
    }

    // ---- Swap the live database ----
    try {
      // wal_checkpoint returns a result row → $queryRawUnsafe, not $executeRawUnsafe
      await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      /* ignore — checkpoint is best-effort */
    }

    await db.$disconnect();
    // give the engine / antivirus a moment to release file locks (Windows)
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      // safety copy so we can roll back if the restored db is unusable
      oldDbPath = `${DB_PATH}.old-${Date.now()}`;
      if (fs.existsSync(DB_PATH)) await renameWithRetry(DB_PATH, oldDbPath);
      else oldDbPath = null;
      for (const suffix of ["-wal", "-shm"]) {
        await rmWithRetry(`${DB_PATH}${suffix}`);
      }
      await renameWithRetry(tmpDbPath, DB_PATH);
      tmpDbPath = null;
    } catch (swapErr) {
      // rollback: put the old db back if the swap failed midway
      try {
        if (!fs.existsSync(DB_PATH) && fs.existsSync(`${DB_PATH}.restore-tmp`)) {
          await renameWithRetry(`${DB_PATH}.restore-tmp`, DB_PATH);
        } else if (!fs.existsSync(DB_PATH) && oldDbPath && fs.existsSync(oldDbPath)) {
          await renameWithRetry(oldDbPath, DB_PATH);
          oldDbPath = null;
        }
      } catch {
        /* best-effort */
      }
      throw swapErr;
    }

    // ---- Move staged uploads into place (overwrite) ----
    try {
      const staged = await fsp.readdir(stagingDir);
      for (const name of staged) {
        const dest = path.join(UPLOAD_DIR, name);
        try {
          await renameWithRetry(path.join(stagingDir, name), dest);
        } catch {
          await rmWithRetry(dest);
          await renameWithRetry(path.join(stagingDir, name), dest);
        }
      }
      await fsp.rm(stagingDir, { recursive: true, force: true });
      stagingDir = null;
    } catch (err) {
      console.warn("upload staging move failed (db restored):", err);
    }

    // ---- Verify the restored database actually works ----
    try {
      await db.treeNode.count();
    } catch (verifyErr) {
      // restored db unusable → roll back to the safety copy
      try {
        await db.$disconnect();
        if (oldDbPath && fs.existsSync(oldDbPath)) {
          await rmWithRetry(DB_PATH);
          await renameWithRetry(oldDbPath, DB_PATH);
          oldDbPath = null;
          await db.treeNode.count(); // should reconnect to the old db
        }
      } catch {
        /* best-effort */
      }
      throw verifyErr;
    }

    // ---- Clean up the safety copy ----
    if (oldDbPath) {
      await fsp.rm(oldDbPath, { force: true }).catch(() => undefined);
      oldDbPath = null;
    }

    return Response.json({
      ok: true,
      restoredFiles,
      restoredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/restore error:", error);
    // best-effort recovery on failure after disconnect
    try {
      if (!fs.existsSync(DB_PATH) && tmpDbPath && fs.existsSync(tmpDbPath)) {
        await renameWithRetry(tmpDbPath, DB_PATH);
      } else if (!fs.existsSync(DB_PATH) && oldDbPath && fs.existsSync(oldDbPath)) {
        await renameWithRetry(oldDbPath, DB_PATH);
      }
      if (stagingDir) await fsp.rm(stagingDir, { recursive: true, force: true });
      if (tmpDbPath && fs.existsSync(tmpDbPath)) {
        await fsp.rm(tmpDbPath, { force: true });
      }
    } catch {
      /* best-effort */
    }
    return Response.json(
      {
        error:
          "রিস্টোর করা সম্ভব হয়নি — অ্যাপ একবার বন্ধ করে START.bat আবার চালু করুন, তারপর সঠিক ব্যাকআপ ZIP দিয়ে আবার চেষ্টা করুন",
      },
      { status: 500 }
    );
  }
}
