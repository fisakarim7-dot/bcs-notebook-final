// Server-only AI helper for the Study engine.
// Provider priority:
//   1) BYOK — the user's own API key (stored locally in the AppSetting row)
//      → direct OpenAI-compatible chat call to the configured base URL
//        (works on the offline laptop ZIP whenever internet is available).
//   2) Built-in z-ai-web-dev-sdk fallback (works inside this workspace).
// The API key NEVER leaves this machine except to the AI provider itself.
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiSettings {
  apiKey: string;
  apiBase: string;
  model: string;
}

export const DEFAULT_API_BASE = "https://api.z.ai/api/paas/v4";
export const DEFAULT_MODEL = "glm-4.7-flash";

export async function getAiSettings(): Promise<AiSettings> {
  const row = await db.appSetting.findUnique({ where: { id: "app" } });
  return {
    apiKey: row?.apiKey ?? "",
    apiBase: (row?.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ""),
    model: (row?.model || DEFAULT_MODEL).trim(),
  };
}

/** Mask an API key for safe display: "abcd••••wxyz" */
export function maskKey(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= 8) return "••••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

function trimContent(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

/**
 * Call the configured LLM. Throws Error with a Bengali-friendly message.
 */
export async function callLlm(
  messages: AiMessage[],
  timeoutMs = 120_000
): Promise<{ content: string; provider: "byok" | "builtin"; model: string }> {
  const s = await getAiSettings();

  // ---- 1) BYOK: direct OpenAI-compatible call with the user's own key ----
  if (s.apiKey.trim()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${s.apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.apiKey.trim()}`,
        },
        body: JSON.stringify({ model: s.model, messages, temperature: 0.6 }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let detail = "";
        try {
          const j = (await res.json()) as {
            error?: { message?: string } | string;
            message?: string;
          };
          detail =
            typeof j.error === "string"
              ? j.error
              : (j.error?.message ?? j.message ?? "");
        } catch {
          /* ignore */
        }
        throw new Error(`AI API ${res.status}${detail ? `: ${detail}` : ""}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = trimContent(data.choices?.[0]?.message?.content);
      if (!content) throw new Error("AI থেকে খালি উত্তর এসেছে");
      return { content, provider: "byok", model: s.model };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("AI কলে দেরি হচ্ছিল (timeout) — আবার চেষ্টা করুন");
      }
      throw e instanceof Error ? e : new Error(String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- 2) Built-in SDK fallback (this workspace) ----
  try {
    const zai = await ZAI.create();
    // The SDK uses the "assistant" role for system prompts.
    const sdkMessages = messages.map((m) =>
      m.role === "system" ? { role: "assistant" as const, content: m.content } : m
    );
    const completion = await zai.chat.completions.create({
      messages: sdkMessages,
      thinking: { type: "disabled" },
    });
    const content = trimContent(completion.choices[0]?.message?.content);
    if (!content) throw new Error("AI থেকে খালি উত্তর এসেছে");
    return { content, provider: "builtin", model: "built-in AI" };
  } catch (e) {
    throw new Error(
      e instanceof Error ? `বিল্ট-ইন AI ব্যর্থ: ${e.message}` : "বিল্ট-ইন AI ব্যর্থ"
    );
  }
}

/** Strip HTML tags to plain text (server-side). */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the first balanced JSON object out of an LLM reply (fence-tolerant). */
export function extractJsonObject(text: string): unknown {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI উত্তরে JSON পাওয়া যায়নি");
  }
  return JSON.parse(t.slice(start, end + 1));
}
