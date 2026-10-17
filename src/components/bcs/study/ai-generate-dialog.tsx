"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  FileArchive,
  FileText,
  FileType2,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Loader2,
  Save,
  Settings2,
  Sparkles,
  StickyNote,
} from "lucide-react";
import {
  aiGenerate,
  createFlashcard,
  createMcq,
  fetchAiSettings,
  fetchAllDocuments,
  fetchStudyTree,
  fetchTree,
  type VaultDocItem,
} from "@/lib/bcs-api";
import { formatBytes, toBn, type AiDraftCard, type AiDraftMcq } from "@/lib/bcs-types";
import { namePathOf, studyNodePathOf } from "@/lib/bcs-tree-utils";
import { plainToHtml } from "./explanation-editor";
import { cn } from "@/lib/utils";
import { NodePicker, StudyNodePicker } from "./shared";
import { BadgeDrill, useBadgeFilter } from "./node-badge-browser";

const COUNTS = [5, 10, 15, 20];
const AI_USABLE_EXT = new Set(["pdf", "docx", "html", "txt"]);

function ExtIcon({ ext, className }: { ext: string; className?: string }) {
  if (ext === "pdf") return <FileArchive className={className} />;
  if (ext === "docx") return <FileType2 className={className} />;
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return <ImageIcon className={className} />;
  return <FileText className={className} />;
}

export function AiGenerateDialog({
  open,
  onOpenChange,
  defaultNodeId = null,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultNodeId?: string | null;
  onOpenSettings?: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"flashcards" | "mcqs">("flashcards");
  const [count, setCount] = useState(10);
  // উৎস: নোডের নোট OR ভল্টের যেকোনো ফাইল
  const [sourceTab, setSourceTab] = useState<"note" | "file">("note");
  const [nodeId, setNodeId] = useState<string | null>(defaultNodeId);
  const [fileId, setFileId] = useState<string | null>(null);
  // যেখানে সেভ হবে — স্টাডির নিজস্ব লেভেল সিস্টেম (ড্যাশবোর্ড ট্রি থেকে স্বাধীন)
  const [targetNode, setTargetNode] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<AiDraftCard[] | AiDraftMcq[] | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [provider, setProvider] = useState<string>("");

  const { data: settings } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: fetchAiSettings,
    enabled: open,
  });
  const { data: vaultDocs = [] } = useQuery({
    queryKey: ["documents", "all"],
    queryFn: fetchAllDocuments,
    enabled: open && sourceTab === "file",
  });
  const { data: treeNodes = [] } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
    enabled: open,
  });
  // the INDEPENDENT study tree — where AI drafts get saved
  const { data: studyNodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
    enabled: open,
  });

  const usableFiles = useMemo(
    () => vaultDocs.filter((d) => AI_USABLE_EXT.has(d.ext.toLowerCase())),
    [vaultDocs]
  );
  // badge-filter over the vault files — lets the user BROWSE any node's files
  const fileBadge = useBadgeFilter(usableFiles);

  const selectedFile = useMemo(
    () => usableFiles.find((f) => f.id === fileId) ?? null,
    [usableFiles, fileId]
  );

  const pathLabel = (id: string | null) => (id ? namePathOf(treeNodes, id).join(" / ") : null);
  const studyPathLabel = (id: string | null) => studyNodePathOf(studyNodes, id);

  const generate = useMutation({
    mutationFn: () =>
      aiGenerate({
        kind,
        count,
        nodeId: sourceTab === "note" ? nodeId : null,
        documentId: sourceTab === "file" ? fileId : null,
      }),
    onSuccess: (res) => {
      setDrafts(res.items as AiDraftCard[] | AiDraftMcq[]);
      setExcluded(new Set());
      setProvider(`${res.provider === "byok" ? res.model : "বিল্ট-ইন AI"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!drafts) return 0;
      const items = drafts.filter((_, i) => !excluded.has(i));
      const studyNodePath = studyPathLabel(targetNode);
      let saved = 0;
      for (const it of items) {
        if (kind === "flashcards") {
          const c = it as AiDraftCard;
          await createFlashcard({
            front: c.front,
            back: c.back,
            studyNodeId: targetNode,
            studyNodePath,
            source: "ai",
          });
          saved += 1;
        } else {
          const m = it as AiDraftMcq;
          const explHtml = m.explanation && m.explanation.trim().length > 0
            ? plainToHtml(m.explanation)
            : "";
          await createMcq({
            question: m.question,
            options: m.options,
            correctIndex: m.correctIndex,
            explanation: m.explanation,
            explanationHtml: explHtml,
            studyNodeId: targetNode,
            studyNodePath,
            source: "ai",
          });
          saved += 1;
        }
      }
      return saved;
    },
    onSuccess: (n) => {
      toast.success(
        `${toBn(n)}টি ${kind === "flashcards" ? "ফ্ল্যাশকার্ড" : "MCQ"} সেভ হয়েছে`
      );
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      qc.invalidateQueries({ queryKey: ["mcqs"] });
      onOpenChange(false);
      setDrafts(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setDrafts(null);
    setExcluded(new Set());
  };

  const close = (o: boolean) => {
    if (!o) {
      setDrafts(null);
      generate.reset();
    }
    onOpenChange(o);
  };

  const toggleItem = (i: number) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const canGenerate = sourceTab === "note" ? !!nodeId : !!fileId;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bengali">
            <Sparkles className="h-5 w-5 text-primary" />
            {drafts ? "AI-এর বানানো খসড়া" : "AI দিয়ে বানান"}
          </DialogTitle>
          <DialogDescription className="font-bengali">
            {drafts
              ? "পছন্দ না হওয়া খসড়া বাদ দিয়ে সেভ করুন — বাকিগুলো সরাসরি রিভিশন চক্রে ঢুকবে।"
              : "নোট থেকে, বা যেকোনো নোডে ব্রাউজ করা ফাইল (PDF/Word/HTML/TXT) থেকে ফ্ল্যাশকার্ড বা MCQ বানান (৩০–৯০ সেকেন্ড)।"}
          </DialogDescription>
        </DialogHeader>

        {!drafts ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="font-bengali">কী বানাবো?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setKind("flashcards")}
                  aria-pressed={kind === "flashcards"}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-4 transition-all font-bengali",
                    kind === "flashcards"
                      ? "border-primary/60 bg-primary/10"
                      : "hover:border-primary/40"
                  )}
                >
                  <Layers className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold">ফ্ল্যাশকার্ড</span>
                  <span className="text-[10px] text-muted-foreground">প্রশ্ন-উত্তর, SRS রিভিশনে</span>
                </button>
                <button
                  onClick={() => setKind("mcqs")}
                  aria-pressed={kind === "mcqs"}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-4 transition-all font-bengali",
                    kind === "mcqs"
                      ? "border-primary/60 bg-primary/10"
                      : "hover:border-primary/40"
                  )}
                >
                  <ListChecks className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold">MCQ প্রশ্ন</span>
                  <span className="text-[10px] text-muted-foreground">৪ অপশন + ব্যাখ্যা</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="font-bengali">কোথা থেকে বানাবো?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSourceTab("note")}
                  aria-pressed={sourceTab === "note"}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all font-bengali",
                    sourceTab === "note"
                      ? "border-primary/60 bg-primary/10"
                      : "hover:border-primary/40"
                  )}
                >
                  <StickyNote className="h-4 w-4 text-primary" /> নোডের নোট
                </button>
                <button
                  onClick={() => setSourceTab("file")}
                  aria-pressed={sourceTab === "file"}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all font-bengali",
                    sourceTab === "file"
                      ? "border-primary/60 bg-primary/10"
                      : "hover:border-primary/40"
                  )}
                >
                  <FolderOpen className="h-4 w-4 text-primary" /> যেকোনো ফাইল
                </button>
              </div>
            </div>

            {sourceTab === "note" ? (
              <div className="flex flex-col gap-1.5">
                <Label className="font-bengali">কোন নোডের লেখা থেকে?</Label>
                <NodePicker
                  value={nodeId}
                  onChange={(id) => {
                    // source stays on the dashboard tree; the save target is a
                    // SEPARATE study-tree level, so don't auto-assign it here.
                    setNodeId(id);
                  }}
                  placeholder="নোড বাছাই করুন"
                />
                {!nodeId && (
                  <p className="text-[11px] text-muted-foreground font-bengali">
                    নোড না বাছলে বানানো যাবে না — নোডের নোটে আগে কিছু লিখুন, অথবা \"যেকোনো ফাইল\" ট্যাব ব্যবহার করুন।
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label className="font-bengali">
                  যেকোনো নোডের যেকোনো ফাইল ব্রাউজ করে বাছুন ({toBn(usableFiles.length)}টি ব্যবহারযোগ্য)
                </Label>
                <div className="grid gap-3 rounded-xl border border-border/60 p-3 lg:grid-cols-2">
                  {/* step 1 — browse the tree as colorful badges */}
                  <div className="flex min-w-0 flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground font-bengali">
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-violet-500/15 text-[9px] font-bold text-violet-600 dark:text-violet-400">১</span>
                      নোড ব্রাউজ করুন
                    </p>
                    <BadgeDrill
                      badge={fileBadge}
                      allLabel="সব ফাইল"
                      emptyLabel="নোড ছাড়া ফাইল"
                      compact
                      className="scroll-slim max-h-56 overflow-y-auto pr-0.5"
                    />
                  </div>
                  {/* step 2 — files of the browsed node */}
                  <div className="flex min-w-0 flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground font-bengali">
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">২</span>
                      {fileBadge.selected === "__all__"
                        ? "সব ফাইল"
                        : `ফাইল — ${fileBadge.selectedPath ?? ""}`} ({toBn(fileBadge.filtered.length)})
                    </p>
                    <div className="scroll-slim max-h-56 overflow-y-auto rounded-xl border border-border/60 p-1.5">
                      {fileBadge.filtered.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground font-bengali">
                          {usableFiles.length === 0
                            ? "ভল্টে এখনো কোনো PDF/DOCX/HTML/TXT ফাইল নেই — Workspace-এ আপলোড করুন"
                            : "এই নোডে কোনো ব্যবহারযোগ্য ফাইল নেই — অন্য নোডে যান"}
                        </p>
                      ) : (
                        fileBadge.filtered.map((f) => (
                          <FileRow
                            key={f.id}
                            file={f}
                            selected={fileId === f.id}
                            onSelect={() => {
                              setFileId(f.id);
                              // target stays an independent study level — the
                              // file's dashboard node is NOT auto-assigned
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
                {selectedFile && (
                  <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-bengali">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    বাছাই হয়েছে: {selectedFile.name} ({selectedFile.nodePath ?? "নোড ছাড়া"})
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label className="font-bengali">কতগুলো?</Label>
              <div className="flex flex-wrap gap-2">
                {COUNTS.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={count === c ? "default" : "outline"}
                    className="h-9 font-bengali"
                    onClick={() => setCount(c)}
                  >
                    {toBn(c)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="font-bengali">কোন লেভেলে সেভ হবে? (স্টাডির নিজস্ব লেভেল — ড্যাশবোর্ডের নোড থেকে স্বাধীন)</Label>
              <StudyNodePicker
                value={targetNode}
                onChange={setTargetNode}
                placeholder="যেমন: নিজের বানানো স্টাডি লেভেল বাছুন"
              />
              {!targetNode && (
                <p className="text-[11px] text-muted-foreground font-bengali">
                  লেভেল ছাড়া সেভ করলে কার্ড/প্রশ্ন \"লেভেল ছাড়া\" বাকেটে যাবে — পরে ব্যাজ ভিউতে সব দেখা যাবে।
                </p>
              )}
            </div>

            <div className="rounded-xl bg-primary/5 p-3 text-[11px] leading-6 text-muted-foreground font-bengali">
              <span className="flex items-start gap-1.5">
                <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  {settings?.hasKey
                    ? `আপনার নিজের key ব্যবহার হবে (${settings.model}) — key শুধু এই ডিভাইসেই সংরক্ষিত।`
                    : "এখন বিল্ট-ইন AI চলছে (এই ওয়ার্কস্পেসে ফ্রী)। ল্যাপটপ ZIP-এ নিজের API key দিতে সেটিংস খুলুন।"}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-6 gap-1 px-2 font-bengali text-xs">
                {toBn(drafts.length - excluded.size)} / {toBn(drafts.length)} নির্বাচিত
              </Badge>
              {targetNode && (
                <Badge variant="outline" className="h-6 max-w-56 gap-1 border px-2 font-bengali text-[10px]">
                  <StickyNote className="h-3 w-3 shrink-0" />
                  <span className="truncate">{studyPathLabel(targetNode)}</span>
                </Badge>
              )}
              {provider && (
                <Badge variant="outline" className="h-6 gap-1 border px-2 font-bengali text-[10px]">
                  <Sparkles className="h-3 w-3" /> {provider}
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 font-bengali" onClick={reset}>
                <ArrowLeft className="h-3.5 w-3.5" /> আবার বানান
              </Button>
            </div>

            <ul className="scroll-slim flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
              {drafts.map((d, i) => {
                const excludedItem = excluded.has(i);
                const front = kind === "flashcards" ? (d as AiDraftCard).front : (d as AiDraftMcq).question;
                const back =
                  kind === "flashcards"
                    ? (d as AiDraftCard).back
                    : (d as AiDraftMcq).options[d.correctIndex as number] ?? "";
                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <button
                      onClick={() => toggleItem(i)}
                      aria-pressed={!excludedItem}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-3 text-start transition-all",
                        excludedItem ? "opacity-45" : "border-primary/30 bg-primary/5"
                      )}
                    >
                      <CheckCircle2
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          excludedItem ? "text-muted-foreground" : "text-primary"
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-6 font-bengali">
                          {front}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground font-bengali">
                          {kind === "mcqs" ? `✔ ${back}` : back}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!drafts && onOpenSettings && (
            <Button variant="ghost" onClick={() => onOpenSettings()} className="mr-auto gap-1.5 font-bengali">
              <Settings2 className="h-4 w-4" /> AI সেটিংস
            </Button>
          )}
          <Button variant="outline" onClick={() => close(false)} className="font-bengali">
            বন্ধ করুন
          </Button>
          {!drafts ? (
            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !canGenerate}
              className="gap-1.5 font-bengali"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> AI ভাবছে…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> জেনারেট করুন
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => saveAll.mutate()}
              disabled={saveAll.isPending || excluded.size === drafts.length}
              className="gap-1.5 font-bengali"
            >
              {saveAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              সেভ করুন
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileRow({
  file,
  selected,
  onSelect,
}: {
  file: VaultDocItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const usable = AI_USABLE_EXT.has(file.ext.toLowerCase());
  return (
    <button
      onClick={onSelect}
      disabled={!usable}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition-all",
        selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent",
        !usable && "cursor-not-allowed opacity-45"
      )}
    >
      <ExtIcon ext={file.ext} className={cn("h-4.5 w-4.5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium font-bengali">{file.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground font-bengali">
          {file.nodePath ?? "নোড ছাড়া"} · {formatBytes(file.size)}
        </span>
      </span>
      {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
