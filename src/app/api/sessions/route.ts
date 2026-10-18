import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/sessions — log a completed pomodoro/focus session
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: string;
      duration?: number;
      nodeId?: string | null;
      nodePath?: string | null;
    };
    const mode =
      body.mode === "break"
        ? "break"
        : body.mode === "stopwatch"
          ? "stopwatch"
          : "focus";
    const duration = Math.max(0, Math.min(Number(body.duration) || 0, 24 * 3600));

    const session = await db.studySession.create({
      data: {
        mode,
        duration,
        nodeId: body.nodeId ?? null,
        nodePath: body.nodePath?.slice(0, 500) ?? null,
      },
    });
    return NextResponse.json({ session });
  } catch (error) {
    console.error("POST /api/sessions error:", error);
    return NextResponse.json({ error: "Failed to log session" }, { status: 500 });
  }
}

// GET /api/sessions — recent sessions
export async function GET() {
  try {
    const sessions = await db.studySession.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("GET /api/sessions error:", error);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}
