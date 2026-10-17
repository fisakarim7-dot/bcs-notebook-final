import { NextResponse } from "next/server";
import * as storage from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/exim/upload-part?uploadId=<id>&index=<n>
// Receives ONE raw chunk (<= ~4MB, under the serverless body cap) and stores it
// as a temporary blob `imports/<id>/part-NNNNN`. The client sends chunks in
// order, then calls /api/exim/import with { uploadId, total } to reassemble.
export async function POST(request: Request) {
  try {
    if (!storage.isCloud) {
      return NextResponse.json({ error: "local mode: send the file directly" }, { status: 400 });
    }
    const url = new URL(request.url);
    const uploadId = (url.searchParams.get("uploadId") ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    const index = Number(url.searchParams.get("index"));
    if (!uploadId || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "uploadId ও index প্রয়োজন" }, { status: 400 });
    }

    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "খালি chunk" }, { status: 400 });
    }

    const name = `imports/${uploadId}/part-${String(index).padStart(5, "0")}`;
    await storage.saveFile(name, buf);
    return NextResponse.json({ ok: true, name, size: buf.byteLength });
  } catch (error) {
    console.error("POST /api/exim/upload-part error:", error);
    return NextResponse.json({ error: "chunk আপলোড ব্যর্থ হয়েছে" }, { status: 500 });
  }
}
