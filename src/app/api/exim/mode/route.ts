import { NextResponse } from "next/server";
import { isCloud } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/exim/mode — lets the UI adapt (local disk vs cloud storage).
export async function GET() {
  return NextResponse.json({ cloud: isCloud, local: !isCloud });
}
