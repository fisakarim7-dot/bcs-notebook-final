import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";
import { callLlm, extractJsonObject, stripHtml } from "@/lib/bcs-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE_CHARS = 12000;
const MAX_COUNT = 20;

const FLASHCARD_SYSTEM = `You are an expert BCS (Bangladesh Civil Service) written-exam coach. From the given study note, create exam-focused flashcards.
Rules:
- Respond with ONLY valid JSON. No markdown fences, no extra text.
- Shape: {"cards":[{"front":"...","back":"..."}]}
- "front": a precise question OR a key term. "back": concise factual answer (1-3 short sentences).
- Write in the SAME LANGUAGE as the note (usually Bengali).
- Keep every field under 220 characters.
- Cover the most exam-relevant facts: dates, numbers, articles, definitions, lists, causes/effects.`;

const MCQ_SYSTEM = `You are an expert BCS preliminary-exam question setter. From the given study note, create multiple-choice questions in real BCS preliminary style.
Rules:
- Respond with ONLY valid JSON. No markdown fences, no extra text.
- Shape: {"mcqs":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}
- Exactly 4 options per question. "correctIndex" is the 0-based index of the correct option.
- "explanation": 1-2 short sentences justifying the answer.
- Write in the SAME LANGUAGE as the note (usually Bengali).
- Distractors must be plausible; only exam-relevant facts.`;

async function collectNodeText(nodeId: string): Promise<string> {
  const [note, items, node] = await Promise.all([
    db.note.findUnique({ where: { nodeId }, select: { content: true } }),
    db.noteItem.findMany({
      where: { nodeId },
      select: { title: true, content: true },
      orderBy: { createdAt: "asc" },
    }),
    db.treeNode.findUnique({ where: { id: nodeId }, select: { name: true } }),
  ]);
  const parts: string[] = [];
  if (node?.name) parts.push(`Topic: ${node.name}`);
  if (note?.content) parts.push(stripHtml(note.content));
  for (const it of items) {
    const t = stripHtml(`${it.title ?? ""} ${it.content ?? ""}`);
    if (t) parts.push(t);
  }
  return parts.filter(Boolean).join("\n\n");
}

/** Extract plain text from ANY vault file (pdf/docx/html/txt) for the AI. */
async function documentToText(documentId: string): Promise<string> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { name: true, ext: true, path: true },
  });
  if (!doc) throw new Error("ফাইলটি পাওয়া যায়নি");
  const fileBuf = await storage.readFile(doc.path);
  if (!fileBuf) throw new Error("ফাইলটি পাওয়া যায়নি");
  let text = "";
  if (doc.ext === "txt") {
    text = fileBuf.toString("utf8");
  } else if (doc.ext === "html") {
    text = stripHtml(fileBuf.toString("utf8"));
  } else if (doc.ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: fileBuf });
    text = result.value;
  } else if (doc.ext === "pdf") {
    const buf = fileBuf;
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text: merged } = await extractText(pdf, { mergePages: true });
    text = Array.isArray(merged) ? merged.join("\n") : merged;
  } else {
    throw new Error(
      "ছবি ফাইল থেকে এখনো কার্ড/MCQ বানানো যায় না — PDF, DOCX, HTML বা TXT ফাইল ব্যবহার করুন"
    );
  }
  return text.replace(/\s+/g, " ").trim();
}

// POST /api/ai/generate
// body: { kind: "flashcards" | "mcqs", nodeId?, documentId?, text?, count? }
// Source: documentId (any vault file) > nodeId (note text) > text (direct).
// Returns DRAFTS only — the client saves them through the normal endpoints.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      kind?: string;
      nodeId?: string | null;
      documentId?: string | null;
      text?: string | null;
      count?: number;
    };
    const kind = body.kind === "mcqs" ? "mcqs" : body.kind === "flashcards" ? "flashcards" : null;
    if (!kind) {
      return NextResponse.json({ error: "kind হতে হবে flashcards বা mcqs" }, { status: 400 });
    }
    let count = Math.round(Number(body.count) || 10);
    count = Math.min(MAX_COUNT, Math.max(1, count));

    let source = (body.text ?? "").trim();
    if (!source && body.documentId) {
      source = await documentToText(body.documentId);
    }
    if (!source && body.nodeId) {
      source = await collectNodeText(body.nodeId);
    }
    if (!source) {
      return NextResponse.json(
        { error: "উৎসে কোনো লেখা পাওয়া যায়নি — ফাইল বেছে নিন বা নোটে কিছু লিখে সেভ করুন" },
        { status: 400 }
      );
    }
    if (source.length > MAX_SOURCE_CHARS) {
      source = `${source.slice(0, MAX_SOURCE_CHARS)}…`;
    }

    const system = kind === "flashcards" ? FLASHCARD_SYSTEM : MCQ_SYSTEM;
    const user = `Study note:\n"""\n${source}\n"""\n\nGenerate exactly ${count} ${kind === "flashcards" ? "flashcards" : "MCQ questions"} from this note.`;

    const { content, provider, model } = await callLlm(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      150_000
    );

    const parsed: unknown = extractJsonObject(content);

    if (kind === "flashcards") {
      const raw = (parsed as { cards?: unknown }).cards;
      if (!Array.isArray(raw)) throw new Error("AI উত্তরের গঠন ঠিক নেই (cards নেই)");
      const items = raw
        .map((c) => {
          const card = c as { front?: unknown; back?: unknown };
          return {
            front: String(card?.front ?? "").trim().slice(0, 600),
            back: String(card?.back ?? "").trim().slice(0, 4000),
          };
        })
        .filter((c) => c.front && c.back)
        .slice(0, MAX_COUNT);
      if (items.length === 0) throw new Error("AI কোনো ব্যবহারযোগ্য কার্ড বানাতে পারেনি");
      return NextResponse.json({ kind, items, provider, model });
    }

    const raw = (parsed as { mcqs?: unknown }).mcqs;
    if (!Array.isArray(raw)) throw new Error("AI উত্তরের গঠন ঠিক নেই (mcqs নেই)");
    const items = raw
      .map((q) => {
        const m = q as {
          question?: unknown;
          options?: unknown;
          correctIndex?: unknown;
          explanation?: unknown;
        };
        const options = Array.isArray(m?.options)
          ? m.options.map((o) => String(o ?? "").trim()).filter((o) => o.length > 0)
          : [];
        let ci = Number(m?.correctIndex);
        if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) ci = 0;
        return {
          question: String(m?.question ?? "").trim().slice(0, 1200),
          options,
          correctIndex: ci,
          explanation: String(m?.explanation ?? "").trim().slice(0, 2000),
        };
      })
      .filter((q) => q.question && q.options.length >= 2 && q.correctIndex < q.options.length)
      .slice(0, MAX_COUNT);
    if (items.length === 0) throw new Error("AI কোনো ব্যবহারযোগ্য প্রশ্ন বানাতে পারেনি");
    return NextResponse.json({ kind, items, provider, model });
  } catch (error) {
    console.error("POST /api/ai/generate error:", error);
    const message =
      error instanceof Error ? error.message : "AI জেনারেশন ব্যর্থ হয়েছে";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
