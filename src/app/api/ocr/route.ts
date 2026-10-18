import { NextResponse } from "next/server";
import { callLlm } from "@/lib/bcs-ai";
import { getAiSettings } from "@/lib/bcs-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OCR via vision-capable OpenAI-compatible API (BYOK).
 * Body: { image: "data:image/...;base64,..." } or { text hint only }.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { image?: string; hint?: string };
    const image = (body.image ?? "").trim();
    if (!image.startsWith("data:image")) {
      return NextResponse.json({ error: "ছবি (data URL) দিন" }, { status: 400 });
    }
    const s = await getAiSettings();
    if (!s.apiKey.trim()) {
      return NextResponse.json(
        { error: "OCR-এর জন্য AI সেটিংসে API key লাগবে (ভিশন সাপোর্টযুক্ত মডেল)" },
        { status: 400 }
      );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(`${s.apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: s.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Extract ALL readable text from this image. Keep original language (Bengali/English). Preserve lists and numbers. Output plain text only. " +
                    (body.hint ? `Hint: ${body.hint}` : ""),
                },
                { type: "image_url", image_url: { url: image } },
              ],
            },
          ],
          temperature: 0.1,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`OCR API ${res.status}${t ? `: ${t.slice(0, 200)}` : ""}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!text) throw new Error("ছবিতে কোনো লেখা পাওয়া যায়নি");
      return NextResponse.json({ text });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error("POST /api/ocr", error);
    // fallback: try text-only LLM describing failure
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "OCR timeout" }, { status: 504 });
    }
    const message = error instanceof Error ? error.message : "OCR ব্যর্থ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
