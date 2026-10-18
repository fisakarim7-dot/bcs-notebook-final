export interface StudyPrefs {
  srs: "leitner" | "fsrs";
  interleave: boolean;
  tts: boolean;
}

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  srs: "leitner",
  interleave: false,
  tts: false,
};

export function parseStudyPrefs(raw: string | null | undefined): StudyPrefs {
  const d = DEFAULT_STUDY_PREFS;
  if (!raw) return d;
  try {
    const p = JSON.parse(raw) as Partial<StudyPrefs>;
    return {
      srs: p.srs === "fsrs" ? "fsrs" : "leitner",
      interleave: typeof p.interleave === "boolean" ? p.interleave : d.interleave,
      tts: typeof p.tts === "boolean" ? p.tts : d.tts,
    };
  } catch {
    return d;
  }
}

/** Round-robin mix by subject (first path segment) so sessions interleave topics. */
export function interleaveByPath<T extends { studyNodePath?: string | null; nodePath?: string | null }>(
  items: T[]
): T[] {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const path = (it.studyNodePath || it.nodePath || "").trim();
    const key = path.split(/\s*[\/›]\s*/)[0] || "__none__";
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }
  const keys = [...buckets.keys()];
  const out: T[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const k of keys) {
      const arr = buckets.get(k);
      if (arr && arr.length) {
        out.push(arr.shift() as T);
        added = true;
      }
    }
  }
  return out;
}

export function speakBn(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const t = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t.slice(0, 4000));
  u.lang = "bn-BD";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export function stopSpeak() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
