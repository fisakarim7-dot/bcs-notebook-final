"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlarmClock,
  FileText,
  Languages,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createWritten,
  deleteWritten,
  evaluateWritten,
  fetchWritten,
  updateWritten,
} from "@/lib/bcs-api";
import { toBn, type WrittenAttemptDTO } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";

const KINDS: { id: string; label: string; prompt: string; marks: number; minutes: number }[] = [
  { id: "essay", label: "রচনা / Essay", prompt: "বিষয় লিখুন — যেমন: জলবায়ু পরিবর্তন ও বাংলাদেশ", marks: 20, minutes: 40 },
  { id: "precis", label: "প্রেসিস / Precis", prompt: "মূল অনুচ্ছেদ পেস্ট করুন — এক-তৃতীয়াংশে সারমর্ম লিখবেন", marks: 15, minutes: 25 },
  { id: "translation", label: "অনুবাদ", prompt: "অনুবাদ করার অনুচ্ছেদ (বাংলা→ইংরেজি বা উল্টো)", marks: 10, minutes: 20 },
  { id: "report", label: "রিপোর্ট / পত্র", prompt: "রিপোর্ট বা দাপ্তরিক পত্রের বিষয়", marks: 10, minutes: 20 },
  { id: "custom", label: "কাস্টম", prompt: "নিজের প্রশ্ন লিখুন", marks: 10, minutes: 20 },
];

export function WrittenStudio() {
  const qc = useQueryClient();
  const [kind, setKind] = useState("essay");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [active, setActive] = useState<WrittenAttemptDTO | null>(null);
  const [answer, setAnswer] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);

  const { data: list = [] } = useQuery({ queryKey: ["written"], queryFn: fetchWritten });
  const def = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  const create = useMutation({
    mutationFn: () =>
      createWritten({
        title: title.trim() || def.label,
        kind,
        promptHtml: `<p>${prompt.replace(/</g, "&lt;")}</p>`,
        marks: def.marks,
        minutes: def.minutes,
      }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["written"] });
      setActive(a);
      setAnswer("");
      setRemaining(a.minutes * 60);
      startRef.current = Date.now();
      setRunning(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const saveAns = useMutation({
    mutationFn: () =>
      updateWritten(active!.id, {
        answerHtml: `<p>${answer.replace(/</g, "&lt;").replace(/\n/g, "</p><p>")}</p>`,
        secondsUsed: Math.round((Date.now() - startRef.current) / 1000),
        status: "submitted",
      }),
    onSuccess: (a) => {
      setActive(a);
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["written"] });
      toast.success("উত্তর জমা হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const evalMut = useMutation({
    mutationFn: () => evaluateWritten(active!.id),
    onSuccess: (d) => {
      setActive(d.attempt);
      qc.invalidateQueries({ queryKey: ["written"] });
      toast.success("AI মূল্যায়ন এসেছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: deleteWritten,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["written"] });
      if (active) setActive(null);
    },
  });

  const feedback = (() => {
    if (!active?.aiFeedback) return null;
    try {
      return JSON.parse(active.aiFeedback) as {
        band?: string;
        score?: number;
        structure?: number;
        facts?: number;
        language?: number;
        comments?: string[];
        improvements?: string[];
      };
    } catch {
      return null;
    }
  })();

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
          <PenLine className="h-5 w-5 text-primary" /> লিখিত উত্তর স্টুডিও
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
          টাইমড রচনা · প্রেসিস · অনুবাদ · রিপোর্ট — AI মার্ক ব্যান্ড (প্রশ্নব্যাংক অক্ষুণ্ণ)
        </p>
      </div>

      {!active ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="glass rounded-2xl p-5 xl:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="font-bengali">ধরন</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="h-9 font-bengali"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id} className="font-bengali">{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="font-bengali">শিরোনাম</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 font-bengali" placeholder={def.label} />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label className="font-bengali">প্রশ্ন / উৎস টেক্সট</Label>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-28 font-bengali" placeholder={def.prompt} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground font-bengali">
              {toBn(def.marks)} নম্বর · {toBn(def.minutes)} মিনিট
            </p>
            <Button className="mt-3 gap-1.5 font-bengali" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              সময় ধরে লেখা শুরু
            </Button>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="mb-2 text-sm font-bold font-bengali">সাম্প্রতিক</p>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground font-bengali">এখনো কিছু নেই</p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
                {list.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => {
                        setActive(a);
                        setAnswer(a.answerHtml.replace(/<[^>]*>/g, "\n").replace(/&lt;/g, "<").trim());
                        setRunning(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-xs hover:bg-accent font-bengali"
                    >
                      <span className="truncate">{a.title}</span>
                      <span className="text-muted-foreground">{a.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
            <span className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-sm font-bold", remaining <= 60 && running ? "text-red-500" : "text-primary")}>
              <AlarmClock className="h-4 w-4" /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
            <span className="text-sm font-bengali">{active.title}</span>
            <Button size="sm" variant="outline" className="ml-auto font-bengali" onClick={() => setActive(null)}>তালিকায় ফিরুন</Button>
          </div>
          {active.promptHtml && (
            <div className="glass rounded-xl p-3 text-sm font-bengali" dangerouslySetInnerHTML={{ __html: active.promptHtml }} />
          )}
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="min-h-[280px] font-bengali text-base leading-7"
            placeholder="এখানে উত্তর লিখুন…"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveAns.mutate()} disabled={saveAns.isPending} className="font-bengali">
              {saveAns.isPending && <Loader2 className="h-4 w-4 animate-spin" />} জমা দিন
            </Button>
            <Button variant="outline" onClick={() => evalMut.mutate()} disabled={evalMut.isPending || !answer.trim()} className="gap-1.5 font-bengali">
              {evalMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI মূল্যায়ন
            </Button>
            <Button variant="ghost" className="text-destructive font-bengali" onClick={() => del.mutate(active.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {feedback && (
            <div className="glass rounded-2xl p-4 font-bengali">
              <p className="text-lg font-bold">
                ব্যান্ড {feedback.band ?? "—"} · স্কোর {toBn(feedback.score ?? 0)}/{toBn(active.marks)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                গঠন {toBn(feedback.structure ?? 0)}/১০ · তথ্য {toBn(feedback.facts ?? 0)}/১০ · ভাষা {toBn(feedback.language ?? 0)}/১০
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(feedback.comments ?? []).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              {(feedback.improvements ?? []).length > 0 && (
                <>
                  <p className="mt-2 text-xs font-bold">উন্নতির দিক</p>
                  <ul className="list-disc pl-5 text-sm">
                    {feedback.improvements!.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
