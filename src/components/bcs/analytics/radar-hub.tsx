"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";
import { fetchAttempts, fetchMcqs } from "@/lib/bcs-api";
import { PRELIM_BUCKETS, matchBucket } from "@/lib/bcs-prelim";
import { toBn } from "@/lib/bcs-types";

export function RadarHub() {
  const { data: mcqsData } = useQuery({ queryKey: ["mcqs", "all"], queryFn: () => fetchMcqs() });
  const { data: attempts = [] } = useQuery({ queryKey: ["attempts"], queryFn: fetchAttempts });

  const radar = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    for (const b of PRELIM_BUCKETS) map.set(b.key, { total: 0, correct: 0 });
    for (const m of mcqsData?.mcqs ?? []) {
      if (!m.attempts) continue;
      const b = matchBucket(m.studyNodePath || m.nodePath);
      if (!b) continue;
      const cur = map.get(b.key)!;
      cur.total += m.attempts;
      cur.correct += m.correctCount;
    }
    return PRELIM_BUCKETS.map((b) => {
      const s = map.get(b.key)!;
      return {
        subject: b.label.replace("ভাষা ও সাহিত্য", "").replace("ও তথ্যপ্রযুক্তি", "").slice(0, 14),
        full: b.label,
        acc: s.total ? Math.round((s.correct / s.total) * 100) : 0,
        n: s.total,
      };
    });
  }, [mcqsData]);

  const mocks = attempts.filter((a) => a.mode === "mock").slice(0, 12).reverse();
  const avg =
    mocks.length > 0 ? Math.round(mocks.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / mocks.length) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
          <BarChart3 className="h-5 w-5 text-primary" /> দুর্বলতা রাডার
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
          বিষয়ভিত্তিক সঠিকতা — পুরনো মক রেজাল্ট স্ক্রিন অক্ষুণ্ণ
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <p className="mb-2 text-sm font-bold font-bengali">প্রিলি বিষয় রাডার</p>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <RadarChart data={radar}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v, _n, p) => [`${v}% (${(p?.payload as { n?: number })?.n ?? 0} চেষ্টা)`, "সঠিকতা"]}
                />
                <Radar dataKey="acc" stroke="#149d8c" fill="#149d8c" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold font-bengali">
            <TrendingUp className="h-4 w-4 text-primary" /> মক ট্রেন্ড
            <span className="ml-auto text-xs font-normal text-muted-foreground">গড় {toBn(avg)}%</span>
          </p>
          {mocks.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground font-bengali">এখনো মক দেননি</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mocks.map((a) => {
                const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
                return (
                  <li key={a.id} className="flex items-center gap-2 text-xs font-bengali">
                    <span className="w-16 text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString("bn-BD", { day: "numeric", month: "short" })}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="w-12 text-end font-bold">{toBn(pct)}%</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground font-bengali">
            কাট-অফ আন্দাজ: সাম্প্রতিক গড় {toBn(avg)}%। প্রিলি সাধারণত ~৪৫–৫০% কাট-অফ —{" "}
            {avg >= 55 ? "এই হারে নিরাপদ ব্যান্ডে আছেন।" : "আরও মক ও দুর্বল বিষয়ে ফোকাস করুন।"}
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="mb-2 text-sm font-bold font-bengali">বিষয়ভিত্তিক তালিকা</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {radar.map((r) => (
            <li key={r.full} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-xs font-bengali">
              <span className="truncate">{r.full}</span>
              <span className={r.acc < 40 ? "font-bold text-red-500" : r.acc < 70 ? "text-amber-600" : "text-emerald-600"}>
                {toBn(r.acc)}% · {toBn(r.n)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
