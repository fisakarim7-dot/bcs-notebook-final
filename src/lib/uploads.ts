import path from "path";

/**
 * Upload storage is anchored to the project root (the folder that contains
 * package.json / prisma/), NOT to process.cwd(). This keeps files working
 * in dev, in `next start`, and even if the app folder is moved on disk —
 * DB rows store only the bare file name and it is resolved at read time.
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (
      exists(path.join(dir, "package.json")) &&
      exists(path.join(dir, "prisma"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function exists(p: string): boolean {
  // Lazy import to keep this helper sync and edge-safe
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export const UPLOAD_DIR = path.join(findProjectRoot(), "db", "uploads");

/**
 * Resolve a Document.path row to an absolute location on disk.
 * New rows store only "<docId>.<ext>"; legacy rows may store an absolute
 * path (works as-is).
 */
export function resolveDocPath(stored: string): string {
  if (path.isAbsolute(stored)) return stored;
  return path.join(UPLOAD_DIR, stored);
}
