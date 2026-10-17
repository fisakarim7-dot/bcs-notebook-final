/**
 * Unified file storage with two backends, chosen by environment:
 *
 *  - LOCAL  (laptop / `next start`): files live on disk in `<project>/db/uploads`.
 *    This is the original behaviour — zero cloud dependency, works offline.
 *  - CLOUD  (Vercel): files live in Vercel Blob (`BLOB_READ_WRITE_TOKEN` set).
 *    Serverless functions have an ephemeral filesystem, so disk persistence is
 *    impossible there.
 *
 * Every caller goes through these helpers so the same code path runs in both
 * environments. `isCloud` gates any behaviour that is fundamentally different.
 */
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import {
  put,
  del,
  list,
  head,
} from "@vercel/blob";
import { UPLOAD_DIR } from "./uploads";

export const isCloud = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const MAX_INLINE = 100 * 1024 * 1024; // cloud upload cap (serverless-friendly)

/**
 * @vercel/blob 0.27.3 *requires* `access: "public"` on put() — omitting it
 * throws `access must be "public"` (see createPutMethod in the SDK). So the
 * Blob store must be a PUBLIC store: Vercel → Storage → your store → Settings.
 * `addRandomSuffix: false` keeps the exact pathname we asked for, so files can
 * be looked up by name later.
 */
const PUT_OPTS = { access: "public", addRandomSuffix: false } as const;

function abs(name: string): string {
  return path.join(UPLOAD_DIR, name);
}

/** Fetch a blob URL; for PRIVATE stores retry with the store token. */
async function authedFetch(url: string): Promise<Response> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const first = await fetch(url);
  if (first.ok || !token) return first;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

/** Does the object exist? */
export async function fileExists(name: string): Promise<boolean> {
  if (!isCloud) return fs.existsSync(abs(name));
  try {
    await head(name);
    return true;
  } catch {
    return false;
  }
}

/** Read full bytes (null when missing). */
export async function readFile(name: string): Promise<Buffer | null> {
  if (!isCloud) {
    try {
      return await fsp.readFile(abs(name));
    } catch {
      return null;
    }
  }
  try {
    const meta = await head(name);
    const res = await authedFetch(meta.url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Public/redirect URL for an object (cloud) or null (local). */
export async function fileUrl(name: string): Promise<string | null> {
  if (!isCloud) return null;
  try {
    const meta = await head(name);
    return meta.url;
  } catch {
    return null;
  }
}

/** Write bytes. */
export async function saveFile(name: string, data: Buffer | Uint8Array): Promise<void> {
  if (!isCloud) {
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    await fsp.writeFile(abs(name), data);
    return;
  }
  await put(name, Buffer.from(data), PUT_OPTS);
}

/**
 * Persist an incoming request body as `<name>`.
 * LOCAL streams to disk (supports 512MB). CLOUD buffers then uploads (100MB cap).
 * Returns bytes written; throws on overflow.
 */
export async function saveFromRequest(
  name: string,
  request: Request,
  maxBytes: number
): Promise<number> {
  if (!request.body) throw new Error("Empty request body");

  if (!isCloud) {
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    const { Readable } = await import("stream");
    const { pipeline } = await import("stream/promises");
    let written = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        written += chunk.byteLength;
        if (written > maxBytes) {
          controller.error(new Error("File exceeds the size limit"));
          return;
        }
        controller.enqueue(chunk);
      },
    });
    const target = abs(name);
    try {
      await pipeline(
        Readable.fromWeb(request.body.pipeThrough(counter) as Parameters<typeof Readable.fromWeb>[0]),
        fs.createWriteStream(target)
      );
    } catch (err) {
      await fsp.rm(target, { force: true }).catch(() => undefined);
      throw err;
    }
    if (written === 0) {
      await fsp.rm(target, { force: true }).catch(() => undefined);
      throw new Error("Empty file");
    }
    return written;
  }

  // Cloud: buffer then upload.
  const cap = Math.min(maxBytes, MAX_INLINE);
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("Empty file");
  if (buf.byteLength > cap) throw new Error("File exceeds the size limit");
  await put(name, buf, PUT_OPTS);
  return buf.byteLength;
}

/** Delete an object (no-op when missing). */
export async function deleteFile(name: string): Promise<void> {
  if (!isCloud) {
    await fsp.rm(abs(name), { force: true }).catch(() => undefined);
    return;
  }
  await del(name).catch(() => undefined);
}

/** List bare file names (excludes dotfiles / meta). */
export async function listFiles(): Promise<string[]> {
  if (!isCloud) {
    try {
      return fs
        .readdirSync(UPLOAD_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && !e.name.startsWith(".") && e.name !== "backup-meta.json")
        .map((e) => e.name);
    } catch {
      return [];
    }
  }
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ cursor });
    for (const blobItem of res.blobs) {
      if (!blobItem.pathname.startsWith(".") && blobItem.pathname !== "backup-meta.json") {
        names.push(blobItem.pathname);
      }
    }
    cursor = res.cursor;
  } while (cursor);
  return names;
}

/** List all blob pathnames under a prefix (used to reassemble chunked uploads). */
export async function listPrefix(prefix: string): Promise<string[]> {
  if (!isCloud) return [];
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ prefix, cursor });
    for (const b of res.blobs) names.push(b.pathname);
    cursor = res.cursor;
  } while (cursor);
  return names;
}

/** Delete every blob under a prefix (cleanup after a chunked import). */
export async function deletePrefix(prefix: string): Promise<void> {
  if (!isCloud) return;
  const names = await listPrefix(prefix);
  if (names.length) await del(names).catch(() => undefined);
}

/** Read an arbitrary blob by pathname (used for the staged import ZIP). */
export async function readBlob(pathname: string): Promise<Buffer | null> {
  if (!isCloud) return null;
  try {
    const meta = await head(pathname);
    const res = await authedFetch(meta.url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteBlob(pathname: string): Promise<void> {
  if (!isCloud) return;
  await del(pathname).catch(() => undefined);
}

/** Small JSON sidecar (backup timestamp) stored next to uploads. */
export async function readBackupMeta(): Promise<{ lastBackupAt?: string } | null> {
  if (!isCloud) {
    try {
      const p = path.join(path.dirname(UPLOAD_DIR), "backup-meta.json");
      return JSON.parse(await fsp.readFile(p, "utf8"));
    } catch {
      return null;
    }
  }
  const buf = await readFile("backup-meta.json");
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

export async function writeBackupMeta(meta: { lastBackupAt: string }): Promise<void> {
  const payload = Buffer.from(JSON.stringify(meta, null, 2));
  if (!isCloud) {
    await fsp
      .writeFile(path.join(path.dirname(UPLOAD_DIR), "backup-meta.json"), payload)
      .catch(() => undefined);
    return;
  }
  await put("backup-meta.json", payload, PUT_OPTS).catch(() => undefined);
}
