"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Newspaper, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createAffair, deleteAffair, fetchAffairs, generateAffair } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";

const CATS: Record<string, string> = {
  bangladesh: "বাংলাদেশ",
  international: "আন্তর্জাতিক",
  economy: "অর্থনীতি",
  science: "বিজ্ঞান",
};

export function AffairsDesk() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ["affairs"], queryFn: () => fetchAffairs() });
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [facts, setFacts] = useState("");
  const [aiText, setAiText] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["affairs"] });

  const save = useMutation({
    mutationFn: () =>
      createAffair({
        title,
        summary,
        factLines: facts.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 5),
      }),
    onSuccess: () => {
      toast.success("সেভ হয়েছে");
      setTitle("");
      setSummary("");
      setFacts("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gen = useMutation({
    mutationFn: () => generateAffair(aiText),
    onSuccess: () => {
      toast.success("AI কার্ড তৈরি হয়েছে");
      setAiText("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: deleteAffair,
    onSuccess: invalidate,
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
          <Newspaper className="h-5 w-5 text-primary" /> কারেন্ট অ্যাফেয়ার্স ডেস্ক
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
          তারিখ · ৩ ফ্যাক্ট · ১ MCQ — ম্যানুয়াল বা AI সামারাইজ
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass flex flex-col gap-2 rounded-2xl p-4">
          <p className="text-sm font-bold font-bengali">নতুন এন্ট্রি</p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="শিরোনাম" className="h-9 font-bengali" />
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="৩–৫ লাইনের সারমর্ম" className="min-h-20 font-bengali" />
          <Textarea value={facts} onChange={(e) => setFacts(e.target.value)} placeholder={"ফ্যাক্ট (প্রতি লাইনে একটি)\nযেমন: ২৪ অক্টোবর ১৯৪৫ — জাতিসংঘ"} className="min-h-20 font-bengali" />
          <Button disabled={!title.trim() || save.isPending} onClick={() => save.mutate()} className="gap-1.5 font-bengali">
            <Plus className="h-4 w-4" /> যোগ করুন
          </Button>
        </div>
        <div className="glass flex flex-col gap-2 rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold font-bengali">
            <Sparkles className="h-4 w-4 text-primary" /> খবর পেস্ট → AI কার্ড
          </p>
          <Textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="খবর/নোট পেস্ট করুন…" className="min-h-32 font-bengali" />
          <Button variant="outline" disabled={aiText.trim().length < 20 || gen.isPending} onClick={() => gen.mutate()} className="gap-1.5 font-bengali">
            {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            কার্ড বানান
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((it) => (
          <li key={it.id} className="glass rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground font-bengali">
                  {it.date} · {CATS[it.category] ?? it.category}
                  {it.source === "ai" && " · AI"}
                </p>
                <p className="text-sm font-bold font-bengali">{it.title}</p>
                {it.summary && <p className="mt-1 text-xs leading-5 text-muted-foreground font-bengali">{it.summary}</p>}
                {it.factLines.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs font-bengali">
                    {it.factLines.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                {it.mcqQuestion && (
                  <div className="mt-2 rounded-xl bg-amber-500/10 p-2 text-xs font-bengali">
                    <p className="font-semibold">{it.mcqQuestion}</p>
                    <ol className="mt-1 list-decimal pl-5">
                      {it.mcqOptions.map((o, i) => (
                        <li key={i} className={i === it.mcqCorrect ? "font-bold text-emerald-600" : ""}>{o}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => del.mutate(it.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground font-bengali">এখনো কোনো কার্ড নেই</p>
        )}
      </ul>
    </motion.div>
  );
}
