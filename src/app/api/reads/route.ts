import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { ReadKind } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["note", "noteItem", "document", "link"]),
  id: z.string().min(1, "id is required"),
});

// POST /api/reads — increment readCount + stamp lastReadAt on any readable item
export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "kind (note/noteItem/document/link) এবং id দিতে হবে" },
        { status: 400 }
      );
    }

    const { kind, id } = parsed.data;

    switch (kind as ReadKind) {
      case "note": {
        const row = await db.note.update({
          where: { id },
          data: { readCount: { increment: 1 }, lastReadAt: new Date() },
          select: { readCount: true, lastReadAt: true },
        });
        return NextResponse.json({
          ok: true,
          readCount: row.readCount,
          lastReadAt: row.lastReadAt.toISOString(),
        });
      }
      case "noteItem": {
        const row = await db.noteItem.update({
          where: { id },
          data: { readCount: { increment: 1 }, lastReadAt: new Date() },
          select: { readCount: true, lastReadAt: true },
        });
        return NextResponse.json({
          ok: true,
          readCount: row.readCount,
          lastReadAt: row.lastReadAt.toISOString(),
        });
      }
      case "document": {
        const row = await db.document.update({
          where: { id },
          data: { readCount: { increment: 1 }, lastReadAt: new Date() },
          select: { readCount: true, lastReadAt: true },
        });
        return NextResponse.json({
          ok: true,
          readCount: row.readCount,
          lastReadAt: row.lastReadAt.toISOString(),
        });
      }
      case "link": {
        const row = await db.link.update({
          where: { id },
          data: { readCount: { increment: 1 }, lastReadAt: new Date() },
          select: { readCount: true, lastReadAt: true },
        });
        return NextResponse.json({
          ok: true,
          readCount: row.readCount,
          lastReadAt: row.lastReadAt.toISOString(),
        });
      }
      default:
        return NextResponse.json(
          { error: "ভুল kind — note/noteItem/document/link হতে হবে" },
          { status: 400 }
        );
    }
  } catch (error) {
    // Prisma P2025 = record not found → treat as bad id
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    const msg = error instanceof Error ? error.message : "";
    if (code === "P2025" || msg.includes("P2025") || msg.includes("Record to update not found")) {
      return NextResponse.json(
        { error: "এই id-তে কোনো আইটেম পাওয়া যায়নি" },
        { status: 400 }
      );
    }
    console.error("POST /api/reads error:", error);
    return NextResponse.json(
      { error: "পড়া রেকর্ড করা যায়নি" },
      { status: 500 }
    );
  }
}
