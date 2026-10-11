/** Anki-style cloze: "বাংলাদেশের রাজধানী {{c1::ঢাকা}}" */

const CLOZE_RE = /\{\{c(\d+)::([^}]*)\}\}/g;

export function hasCloze(text: string): boolean {
  return /\{\{c\d+::/.test(text || "");
}

export function clozePrompt(text: string, hideIndex?: number): string {
  return (text || "").replace(CLOZE_RE, (_m, n: string, answer: string) => {
    const i = Number(n);
    if (hideIndex != null && i !== hideIndex) return answer;
    return "____";
  });
}

export function clozeReveal(text: string): string {
  return (text || "").replace(CLOZE_RE, (_m, _n: string, answer: string) => answer);
}

export function clozeAnswers(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(CLOZE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) out.push(m[2]);
  return out;
}
