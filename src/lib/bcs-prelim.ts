/** Official BCS Preliminary mark distribution (BPSC, 200 marks / 120 min). */
export interface PrelimsBucket {
  key: string;
  label: string;
  count: number;
  aliases: string[];
}

export const PRELIM_BUCKETS: PrelimsBucket[] = [
  { key: "bangla", label: "বাংলা ভাষা ও সাহিত্য", count: 35, aliases: ["বাংলা", "bangla", "bengali", "সাহিত্য"] },
  { key: "english", label: "ইংরেজি ভাষা ও সাহিত্য", count: 35, aliases: ["english", "ইংরেজি", "grammar"] },
  { key: "bd", label: "বাংলাদেশ বিষয়াবলি", count: 30, aliases: ["বাংলাদেশ", "bangladesh", "সংবিধান", "মুক্তিযুদ্ধ"] },
  { key: "intl", label: "আন্তর্জাতিক বিষয়াবলি", count: 20, aliases: ["আন্তর্জাতিক", "international", "un", "জাতিসংঘ"] },
  { key: "geo", label: "ভূগোল, পরিবেশ ও দুর্যোগ", count: 10, aliases: ["ভূগোল", "geography", "পরিবেশ", "দুর্যোগ"] },
  { key: "science", label: "সাধারণ বিজ্ঞান", count: 15, aliases: ["বিজ্ঞান", "science"] },
  { key: "ict", label: "কম্পিউটার ও তথ্যপ্রযুক্তি", count: 15, aliases: ["কম্পিউটার", "ict", "computer", "তথ্য"] },
  { key: "math", label: "গাণিতিক যুক্তি", count: 15, aliases: ["গণিত", "math", "গাণিতিক", "শতকরা"] },
  { key: "mental", label: "মানসিক দক্ষতা", count: 15, aliases: ["মানসিক", "mental", "সিরিজ"] },
  { key: "ethics", label: "নৈতিকতা, মূল্যবোধ ও সুশাসন", count: 10, aliases: ["নৈতিকতা", "ethics", "সুশাসন", "মূল্যবোধ"] },
];

export const PRELIM_TOTAL = PRELIM_BUCKETS.reduce((s, b) => s + b.count, 0); // 200
export const PRELIM_MINUTES = 120;

export function matchBucket(path: string | null | undefined): PrelimsBucket | null {
  const p = (path || "").toLowerCase();
  if (!p) return null;
  for (const b of PRELIM_BUCKETS) {
    if (b.aliases.some((a) => p.includes(a.toLowerCase()))) return b;
  }
  return null;
}

export interface Distributable {
  id: string;
  studyNodePath?: string | null;
  nodePath?: string | null;
}

/** Pick up to `count` items following official subject quotas; leftover fills remaining. */
export function pickPrelimDistribution<T extends Distributable>(pool: T[], total = PRELIM_TOTAL): T[] {
  const byKey = new Map<string, T[]>();
  const rest: T[] = [];
  for (const item of pool) {
    const b = matchBucket(item.studyNodePath || item.nodePath);
    if (!b) {
      rest.push(item);
      continue;
    }
    const arr = byKey.get(b.key) ?? [];
    arr.push(item);
    byKey.set(b.key, arr);
  }
  const picked: T[] = [];
  const used = new Set<string>();
  const take = (list: T[], n: number) => {
    for (const it of list) {
      if (picked.length >= total) return;
      if (n <= 0) return;
      if (used.has(it.id)) continue;
      used.add(it.id);
      picked.push(it);
      n -= 1;
    }
  };
  for (const b of PRELIM_BUCKETS) {
    take(byKey.get(b.key) ?? [], b.count);
  }
  take(rest, total - picked.length);
  for (const b of PRELIM_BUCKETS) take(byKey.get(b.key) ?? [], total - picked.length);
  return picked.slice(0, total);
}
