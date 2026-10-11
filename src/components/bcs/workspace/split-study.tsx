"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchFlashcards, fetchMcqs } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { useBcsStore } from "@/lib/bcs-store";

/** Compact right-rail: due cards + a few MCQs while reading a note. */
export function SplitStudyRail({ onClose }: { onClose: () => void }) {
  const goStudy = useBcsStore((s) => s.goStudy);
  const [tab, setTab] = useState<"cards" | "mcq">("cards");
  const { data: due } = useQuery({ queryKey: ["flashcards", "due"], queryFn: () => fetchFlashcards("due") });
  const { data: mcqs } = useQuery({ queryKey: ["mcqs", "all"], queryFn: () => fetchMcqs() });
  const cards = (due?.cards ?? []).slice(0, 8);
  const qs = (mcqs?.mcqs ?? []).filter((m) => !m.suspended).slice(0, 6);

  return (
    <aside className="glass flex h-full w-full flex-col rounded-2xl p-3 lg:w-80">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold font-bengali">স্প্লিট স্টাডি</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="বন্ধ">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mb-2 flex gap-1">
        <button
          onClick={() => setTab("cards")}
          className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bengali ${tab === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          <Layers className="h-3 w-3" /> কার্ড {toBn(due?.count ?? 0)}
        </button>
        <button
          onClick={() => setTab("mcq")}
          className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bengali ${tab === "mcq" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          <ListChecks className="h-3 w-3" /> MCQ
        </button>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {tab === "cards"
          ? cards.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/60 p-2 text-xs font-bengali">
                <p className="line-clamp-2 font-medium">{c.front}</p>
              </li>
            ))
          : qs.map((m) => (
              <li key={m.id} className="rounded-lg border border-border/60 p-2 text-xs font-bengali">
                <p className="line-clamp-2 font-medium">{m.question}</p>
              </li>
            ))}
      </ul>
      <Button size="sm" className="mt-2 font-bengali" onClick={goStudy}>
        পুরো রিভিশন হাব
      </Button>
    </aside>
  );
}
