import fs from "fs";
import path from "path";
import { UPLOAD_DIR } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_PATH = path.join(path.dirname(UPLOAD_DIR), "backup-meta.json");

// GET /api/backup/status — when was the last backup taken?
export async function GET() {
  try {
    let lastBackupAt: string | null = null;
    try {
      const raw = fs.readFileSync(META_PATH, "utf-8");
      const parsed = JSON.parse(raw) as { lastBackupAt?: string };
      if (parsed.lastBackupAt) {
        const d = new Date(parsed.lastBackupAt);
        if (!Number.isNaN(d.getTime())) lastBackupAt = d.toISOString();
      }
    } catch {
      // no meta file yet → nulls
    }

    const daysSince =
      lastBackupAt === null
        ? null
        : Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000);

    return Response.json({ lastBackupAt, daysSince });
  } catch (error) {
    console.error("GET /api/backup/status error:", error);
    return Response.json(
      { error: "ব্যাকআপ স্ট্যাটাস লোড করা যায়নি" },
      { status: 500 }
    );
  }
}
