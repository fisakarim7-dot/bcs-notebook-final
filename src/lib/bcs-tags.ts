// ---------- Tag System (#14): shared helpers ----------
// Tags are stored on Mcq.tags as a JSON string array. Normalization strips
// leading "#", trims, collapses spaces, dedupes case-insensitively and caps
// at 12 tags × 24 chars per question.

export const DEFAULT_TAG_SUGGESTIONS = [
  "Important",
  "MustRead",
  "Economy",
  "CurrentAffairs",
  "Constitution",
  "Revision",
] as const;

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw.slice(0, 24)) {
    const t = String(item ?? "")
      .replace(/^#+/, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 24);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

export function parseTags(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 12) : [];
  } catch {
    return [];
  }
}

/** stable small hash → color-pool index (tag chip colors) */
export function tagHueIndex(tag: string, poolSize: number): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % poolSize;
}
