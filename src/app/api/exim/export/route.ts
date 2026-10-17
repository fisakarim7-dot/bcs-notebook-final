import { NextResponse } from "next/server";
import JSZip from "jszip";
import { collectData, collectUploads } from "@/lib/bcs-exim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/exim/export — full data + uploads bundle (works on SQLite & Postgres).
export async function GET() {
  try {
    const zip = new JSZip();
    const data = await collectData();
    zip.file("data.json", JSON.stringify(data));

    const uploads = await collectUploads();
    for (const u of uploads) {
      zip.file(`uploads/${u.name}`, u.data);
    }

    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="bcs-notebook-export-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/exim/export error:", error);
    return NextResponse.json({ error: "এক্সপোর্ট করা যায়নি" }, { status: 500 });
  }
}
