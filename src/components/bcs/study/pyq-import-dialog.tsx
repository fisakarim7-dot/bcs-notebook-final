"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importMcqs } from "@/lib/bcs-api";

export function PyqImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [tag, setTag] = useState("BCS-PYQ");
  const [raw, setRaw] = useState("");

  const run = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("সঠিক JSON দিন");
      }
      const arr = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
      if (!Array.isArray(arr)) throw new Error("JSON অ্যারে বা {items:[]} দিন");
      const items = arr.map((q: unknown) => {
        const o = q as {
          question?: string;
          options?: string[];
          correctIndex?: number;
          explanation?: string;
          tags?: string[];
        };
        return {
          question: String(o.question ?? ""),
          options: Array.isArray(o.options) ? o.options.map(String) : [],
          correctIndex: Number(o.correctIndex) || 0,
          explanation: o.explanation,
          tags: o.tags,
        };
      });
      return importMcqs(items, tag || undefined);
    },
    onSuccess: (d) => {
      toast.success(`${d.created}টি প্রশ্ন ইমপোর্ট হয়েছে${d.skipped ? `, ${d.skipped} বাদ` : ""}`);
      qc.invalidateQueries({ queryKey: ["mcqs"] });
      onOpenChange(false);
      setRaw("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-bengali">PYQ ইমপোর্ট (JSON/CSV-স্টাইল JSON)</DialogTitle>
          <DialogDescription className="font-bengali">
            ফরম্যাট: [{`{"question","options":["ক","খ","গ","ঘ"],"correctIndex":0,"explanation","tags"}`}] — ব্যাংক UI অক্ষুণ্ণ
          </DialogDescription>
        </DialogHeader>
        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="ট্যাগ যেমন BCS-45" className="h-9 font-bengali" />
        <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="min-h-48 font-mono text-xs" placeholder='[{"question":"...","options":["..."],"correctIndex":0}]' />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-bengali">বাতিল</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || !raw.trim()} className="gap-1.5 font-bengali">
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            ইমপোর্ট
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
