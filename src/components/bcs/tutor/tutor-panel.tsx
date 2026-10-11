"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askTutor, fetchTree } from "@/lib/bcs-api";
import { useBcsStore } from "@/lib/bcs-store";
import { namePathOf } from "@/lib/bcs-tree-utils";

interface Msg { role: "user" | "assistant"; content: string }

export function TutorPanel() {
  const selectedId = useBcsStore((s) => s.selectedId);
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree, staleTime: 60_000 });
  const path = selectedId ? namePathOf(nodes, selectedId).join(" › ") : null;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const next: Msg[] = [...messages, { role: "user", content: input.trim() }];
      const { reply } = await askTutor(next, selectedId);
      return { next, reply };
    },
    onSuccess: ({ next, reply }) => {
      setMessages([...next, { role: "assistant", content: reply }]);
      setInput("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[70vh] flex-col gap-3 pb-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
          <Sparkles className="h-5 w-5 text-primary" /> নোট-টিউটর
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
          নির্বাচিত নোডের নোট কনটেক্সট ধরে প্রশ্ন করুন — কার্ড জেনারেটর আলাদাই থাকবে
        </p>
        {path && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-primary font-bengali">
            <TreePine className="h-3 w-3" /> কনটেক্সট: {path}
          </p>
        )}
      </div>

      <div className="glass flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground font-bengali">
            যেমন: «এই নোট থেকে ৫টা প্রিলি প্রশ্ন দাও» বা «সংবিধানের ৭ অনুচ্ছেদ বুঝিয়ে দাও»
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl bg-primary/10 px-3 py-2 text-sm font-bengali"
                : "mr-8 rounded-2xl bg-muted/50 px-3 py-2 text-sm leading-6 font-bengali whitespace-pre-wrap"
            }
          >
            {m.content}
          </div>
        ))}
        {send.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground font-bengali">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> ভাবছি…
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim()) send.mutate();
            }
          }}
          placeholder="প্রশ্ন লিখুন…"
          className="min-h-[48px] font-bengali"
        />
        <Button
          className="h-12 w-12 shrink-0"
          disabled={!input.trim() || send.isPending}
          onClick={() => send.mutate()}
          aria-label="পাঠান"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
