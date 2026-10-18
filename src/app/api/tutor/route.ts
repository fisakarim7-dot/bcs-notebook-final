import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLlm, stripHtml } from "@/lib/bcs-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CTX = 10000;

async function collectNodeText(nodeId: string): Promise<string> {
  const [note, items, node] = await Promise.all([
    db.note.findUnique({ where: { nodeId }, select: { content: true } }),
    db.noteItem.findMany({ where: { nodeId }, select: { title: true, content: true } }),
    db.treeNode.findUnique({ where: { id: nodeId }, select: { name: true } }),
  ]);
  const parts: string[] = [];
  if (node?.name) parts.push(`Topic: ${node.name}`);
  if (note?.content) parts.push(stripHtml(note.content));
  for (const it of items) {
    const t = stripHtml(`${it.title} ${it.content}`);
    if (t) parts.push(t);
  }
  return parts.join("\n\n").slice(0, MAX_CTX);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      nodeId?: string | null;
      messages?: { role: string; content: string }[];
    };
    const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const last = history.filter((m) => m.role === "user").pop();
    if (!last?.content?.trim()) {
      return NextResponse.json({ error: "প্রশ্ন লিখুন" }, { status: 400 });
    }
    let ctx = "";
    if (body.nodeId) ctx = await collectNodeText(body.nodeId);

    const system = `You are a BCS exam tutor. Answer in the student's language (usually Bengali).
Be precise: dates, articles, numbers. If the note context is given, prefer it; say when you go beyond it.
If asked for MCQs or flashcards, produce a short list. Keep answers exam-focused.`;

    const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
    ];
    if (ctx) {
      msgs.push({ role: "user", content: `STUDY NOTES (context):\n"""\n${ctx}\n"""` });
      msgs.push({ role: "assistant", content: "নোট পড়েছি — প্রশ্ন করুন।" });
    }
    for (const m of history) {
      const role = m.role === "assistant" ? "assistant" : "user";
      msgs.push({ role, content: String(m.content ?? "").slice(0, 4000) });
    }

    const { content, provider, model } = await callLlm(msgs, 120_000);
    return NextResponse.json({ reply: content, provider, model });
  } catch (error) {
    console.error("POST /api/tutor", error);
    const message = error instanceof Error ? error.message : "টিউটর ব্যর্থ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
