import { NextResponse } from "next/server";
import { collectData } from "@/lib/bcs-exim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/exim/export-data — data-only bundle (no uploaded files).
// Small JSON, so it imports reliably everywhere (no Blob, no size limits).
export async function GET() {
  try {
    const data = await collectData();
    const body = JSON.stringify(data);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bcs-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/exim/export-data error:", error);
    return NextResponse.json({ error: "ডেটা এক্সপোর্ট করা যায়নি" }, { status: 500 });
  }
}
