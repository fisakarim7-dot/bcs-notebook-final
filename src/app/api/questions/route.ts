import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function mapAttachment(a: {
  id: string;
  questionId: string;
  kind: string;
  name: string;
  ext: string;
  mime: string;
  size: number;
  path: string;
  url: string;
  provider: string;
  contentHtml: string;
  font: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    questionId: a.questionId,
    kind: a.kind,
    name: a.name,
    ext: a.ext,
    mime: a.mime,
    size: a.size,
    path: a.path,
    url: a.url,
    provider: a.provider,
    contentHtml: a.contentHtml,
    font: a.font,
    createdAt: a.createdAt,
  };
}

// GET /api/questions — all questions, or only a node's: ?nodeId=...
// Each question carries its answer-sources (attachments) for the premium card UI.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const nodeId = url.searchParams.get("nodeId");

    const questions = await db.question.findMany({
      where: nodeId ? { nodeId } : {},
      orderBy: { updatedAt: "desc" },
      include: { attachments: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q.id,
        nodeId: q.nodeId,
        nodePath: q.nodePath,
        title: q.title,
        contentHtml: q.contentHtml,
        contentPlain: q.contentPlain,
        favorite: q.favorite,
        noteHtml: q.noteHtml,
        notePlain: q.notePlain,
        attachments: q.attachments.map(mapAttachment),
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
      count: questions.length,
    });
  } catch (error) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json({ error: "প্রশ্ন লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/questions — create a rich-text question (optionally bound to a node)
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      nodeId?: string | null;
      title?: string;
      contentHtml?: string;
    };

    const contentHtml = (body.contentHtml ?? "").trim();
    const title = (body.title ?? "").trim();

    if (!contentHtml || contentHtml === "<p></p>") {
      return NextResponse.json({ error: "প্রশ্নের বিষয়বস্তু লিখুন" }, { status: 400 });
    }

    let nodePath: string | null = null;
    if (body.nodeId) {
      const chain: string[] = [];
      let cur = await db.treeNode.findUnique({ where: { id: body.nodeId } });
      if (!cur) {
        return NextResponse.json({ error: "Node not found" }, { status: 404 });
      }
      while (cur) {
        chain.unshift(cur.name);
        cur = cur.parentId
          ? await db.treeNode.findUnique({ where: { id: cur.parentId } })
          : null;
      }
      nodePath = chain.join(" / ");
    }

    const question = await db.question.create({
      data: {
        nodeId: body.nodeId || null,
        nodePath,
        title: title.slice(0, 300),
        contentHtml: contentHtml.slice(0, 200_000),
        contentPlain: htmlToPlain(contentHtml).slice(0, 20_000),
      },
    });

    return NextResponse.json(
      {
        question: {
          ...question,
          attachments: [],
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/questions error:", error);
    return NextResponse.json({ error: "প্রশ্ন সেভ করা যায়নি" }, { status: 500 });
  }
}
