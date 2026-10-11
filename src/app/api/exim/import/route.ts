import { NextResponse } from "next/server";
import JSZip from "jszip";
import { applyData, type EximData } from "@/lib/bcs-exim";
import * as storage from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/exim/import — apply a bundle produced by /api/exim/export.
// Three input modes (most reliable first):
//   1. JSON { tables }        : direct data-only import (small, no Blob, no chunks) — ALWAYS works.
//   2. JSON { uploadId,total }: cloud — ZIP was uploaded in chunks; reassemble then apply.
//   3. raw zip body           : local — small bundles posted directly.
// Wipes current data and re-inserts tables (+ upload files when a ZIP is given). DESTRUCTIVE.
export async function POST(request: Request) {
  let prefix: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let data: EximData | null = null;
    let buf: Buffer | null = null;
    let files = 0;

    if (contentType.includes("application/json")) {
      const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;

      if (raw && typeof raw === "object" && "tables" in raw) {
        // Mode 1: direct data-only JSON.
        data = raw as unknown as EximData;
      } else {
        // Mode 2: chunked cloud upload.
        const uploadId = String(raw?.uploadId ?? "").replace(/[^a-zA-Z0-9-]/g, "");
        const total = Number(raw?.total);
        if (!uploadId || !Number.isInteger(total) || total <= 0) {
          return NextResponse.json({ error: "সঠিক ইমপোর্ট ডেটা নয়" }, { status: 400 });
        }
        prefix = `imports/${uploadId}/`;
        const chunks: Buffer[] = [];
        for (let i = 0; i < total; i++) {
          const part = await storage.readBlob(`${prefix}part-${String(i).padStart(5, "0")}`);
          if (!part) {
            return NextResponse.json({ error: `chunk ${i + 1} পাওয়া যায়নি — আবার আপলোড করুন` }, { status: 400 });
          }
          chunks.push(part);
        }
        buf = Buffer.concat(chunks);
      }
    } else {
      // Mode 3: raw zip body.
      buf = Buffer.from(await request.arrayBuffer());
    }

    if (!data && buf) {
      if (buf.byteLength === 0) {
        return NextResponse.json({ error: "খালি ফাইল" }, { status: 400 });
      }
      const zip = await JSZip.loadAsync(buf);
      const dataFile = zip.file("data.json");
      if (!dataFile) {
        return NextResponse.json({ error: "এটি সঠিক এক্সপোর্ট ফাইল নয় (data.json নেই)" }, { status: 400 });
      }
      data = JSON.parse(await dataFile.async("string")) as EximData;

      // restore upload files from the zip (local mode / full zip)
      const uploadsFolder = zip.folder("uploads");
      if (uploadsFolder) {
        const entries = Object.values(uploadsFolder.files).filter((f) => !f.dir);
        for (const entry of entries) {
          const name = entry.name.replace(/^uploads\//, "");
          if (!name) continue;
          await storage.saveFile(name, await entry.async("nodebuffer"));
          files++;
        }
      }
    }

    if (!data || data.version !== 1 || typeof data.tables !== "object") {
      return NextResponse.json({ error: "অসমর্থিত এক্সপোর্ট ভার্সন" }, { status: 400 });
    }

    const { counts } = await applyData(data);
    if (prefix) await storage.deletePrefix(prefix);
    return NextResponse.json({ ok: true, counts, files });
  } catch (error) {
    console.error("POST /api/exim/import error:", error);
    if (prefix) await storage.deletePrefix(prefix).catch(() => undefined);
    return NextResponse.json({ error: "ইমপোর্ট করা যায়নি" }, { status: 500 });
  }
}
