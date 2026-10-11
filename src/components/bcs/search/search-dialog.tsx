"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchAll, fetchTree, createNode } from "@/lib/bcs-api";
import type { SearchResult } from "@/lib/bcs-types";
import { useBcsStore } from "@/lib/bcs-store";
import { ancestorsOf } from "@/lib/bcs-tree-utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FolderOpen,
  StickyNote,
  TextQuote,
  LayoutDashboard,
  Plus,
  Moon,
  Sun,
  NotebookPen,
  FileText,
  FileType,
  FileImage,
  Code,
  Link2,
  Globe,
  Cloud,
  HardDrive,
  CloudDrizzle,
  FileQuestion,
  ListChecks,
  Layers,
  CalendarCheck,
  Heart,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

/** Lightweight fuzzy score: substring bonus + subsequence fallback */
function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0;
  let score = 40;
  let prev = -2;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return 0;
    if (idx === prev + 1) score += 4;
    prev = idx;
    ti = idx + 1;
  }
  return score;
}

function docIcon(title: string | undefined) {
  const ext = title?.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return <FileText className="h-4 w-4 shrink-0 text-destructive/80" />;
  if (ext === "docx") return <FileType className="h-4 w-4 shrink-0 text-primary" />;
  if (ext === "html" || ext === "htm") return <Code className="h-4 w-4 shrink-0 text-chart-2" />;
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) {
    return <FileImage className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function linkIcon(url: string) {
  const u = url.toLowerCase();
  if (u.includes("drive.google") || u.includes("docs.google")) {
    return <CloudDrizzle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (u.includes("onedrive") || u.includes("1drv.ms") || u.includes("sharepoint")) {
    return <Cloud className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />;
  }
  if (u.includes("dropbox")) {
    return <HardDrive className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />;
  }
  return <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function SearchDialog() {
  const {
    searchOpen,
    setSearchOpen,
    selectNode,
    openNodeTab,
    goDashboard,
    goStudy,
    goCalendar,
    goFavorites,
  } = useBcsStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchAll(debounced),
    enabled: searchOpen && debounced.length > 0,
    staleTime: 5_000,
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
    enabled: searchOpen,
  });

  const jump = (nodeId: string) => {
    selectNode(nodeId, ancestorsOf(nodes, nodeId));
    setSearchOpen(false);
  };

  /** Deep-link jump: opens the node AND the exact tab the result lives in. */
  const jumpTo = (r: SearchResult) => {
    if (r.kind === "mcq" || r.kind === "flashcard") {
      goStudy(); // revision hub
      setSearchOpen(false);
      return;
    }
    if (r.kind === "plan" && (!r.nodeId || !r.tab)) {
      goCalendar();
      setSearchOpen(false);
      return;
    }
    if (r.kind === "favorite" && (!r.nodeId || !r.tab)) {
      goFavorites();
      setSearchOpen(false);
      return;
    }
    if (r.tab && r.nodeId) {
      openNodeTab(r.nodeId, r.tab, ancestorsOf(nodes, r.nodeId));
      setSearchOpen(false);
      return;
    }
    jump(r.nodeId);
  };

  const ranked = useMemo(() => {
    if (!debounced) return [];
    const scored = results
      .map((r) => ({
        r,
        score:
          fuzzyScore(r.name ?? "", debounced) +
          fuzzyScore(r.snippet ?? "", debounced) * 0.3 +
          (r.kind === "node" ? 5 : 0),
      }))
      .filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.r);
  }, [results, debounced]);

  const nodeResults = ranked.filter((r: SearchResult) => r.kind === "node");
  const contentResults = ranked.filter((r: SearchResult) => r.kind === "content");
  const noteItemResults = ranked.filter((r: SearchResult) => r.kind === "noteItem");
  const documentResults = ranked.filter((r: SearchResult) => r.kind === "document");
  const linkResults = ranked.filter((r: SearchResult) => r.kind === "link");
  const questionResults = ranked.filter((r: SearchResult) => r.kind === "question");
  const mcqResults = ranked.filter((r: SearchResult) => r.kind === "mcq");
  const flashcardResults = ranked.filter((r: SearchResult) => r.kind === "flashcard");
  const planResults = ranked.filter((r: SearchResult) => r.kind === "plan");
  const favoriteResults = ranked.filter((r: SearchResult) => r.kind === "favorite");

  const createSubject = async () => {
    try {
      const created = await createNode({ name: debounced, type: "folder", parentId: null });
      toast.success(`বিষয় "${debounced}" তৈরি হয়েছে`);
      jump(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "তৈরি করা যায়নি");
    }
  };

  const row = (
    r: SearchResult,
    key: string,
    icon: React.ReactNode,
    titleText: string,
    options?: { mono?: boolean }
  ) => (
    <CommandItem key={key} value={key} onSelect={() => jumpTo(r)} className="gap-2">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium font-bengali">{titleText}</span>
        {r.snippet && (
          <span
            className={`block truncate text-[10px] text-muted-foreground ${options?.mono ? "font-mono" : "font-bengali"}`}
            title={r.snippet}
          >
            {r.snippet}
          </span>
        )}
        {!r.snippet && r.path && (
          <span className="block truncate text-[10px] text-muted-foreground font-bengali">
            {r.path}
          </span>
        )}
      </span>
    </CommandItem>
  );

  return (
    <Dialog
      open={searchOpen}
      onOpenChange={(o) => {
        setSearchOpen(o);
        if (!o) {
          setQuery("");
          setDebounced("");
        }
      }}
    >
      <DialogContent className="glass-strong max-w-xl overflow-hidden p-0" showCloseButton>
        <DialogHeader className="sr-only">
          <DialogTitle>প্রিমিয়াম সার্চ</DialogTitle>
          <DialogDescription>
            অ্যাপের যেকোনো টেক্সট খুঁজুন — নোট, প্রশ্নব্যাংক, MCQ, ফ্ল্যাশকার্ড, ফাইল, লিংক, ক্যালেন্ডার ও প্রিয়
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="প্রিমিয়াম সার্চ — অ্যাপের যেকোনো কিছু খুঁজুন…"
          />
          <CommandList className="scroll-slim max-h-[55vh] px-1 pb-1">
            {!debounced && (
              <>
                <CommandGroup heading="দ্রুত কাজ">
                  <CommandItem
                    value="dashboard"
                    onSelect={() => {
                      goDashboard();
                      setSearchOpen(false);
                    }}
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-bengali">ড্যাশবোর্ডে যান</span>
                  </CommandItem>
                  <CommandItem
                    value="theme"
                    onSelect={() => {
                      setTheme(resolvedTheme === "dark" ? "light" : "dark");
                      setSearchOpen(false);
                    }}
                  >
                    {resolvedTheme === "dark" ? (
                      <Sun className="mr-2 h-4 w-4" />
                    ) : (
                      <Moon className="mr-2 h-4 w-4" />
                    )}
                    <span className="font-bengali">থিম পরিবর্তন</span>
                  </CommandItem>
                </CommandGroup>
                <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px] text-muted-foreground font-bengali">
                  <Sparkles className="h-3 w-3 text-primary" />
                  নোট, প্রশ্নব্যাংক, MCQ, ফ্ল্যাশকার্ড, ফাইল, লিংক, ক্যালেন্ডার, প্রিয় — সব এক সার্চে
                </div>
                {nodes.filter((n) => n.parentId === null).length > 0 && (
                  <CommandGroup heading="বিষয়ে যান">
                    {nodes
                      .filter((n) => n.parentId === null)
                      .slice(0, 8)
                      .map((n) => (
                        <CommandItem key={n.id} value={`s-${n.id}`} onSelect={() => jump(n.id)}>
                          <FolderOpen className="mr-2 h-4 w-4 shrink-0 text-chart-2" />
                          <span className="truncate font-bengali">{n.name}</span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
              </>
            )}

            {debounced && isFetching && ranked.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground font-bengali">
                খোঁজা হচ্ছে…
              </p>
            )}

            {debounced && !isFetching && ranked.length === 0 && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-sm text-muted-foreground font-bengali">
                    &ldquo;<span className="font-semibold">{debounced}</span>&rdquo; এর জন্য কোনো মিল পাওয়া যায়নি।
                  </p>
                  <button
                    onClick={createSubject}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 font-bengali"
                  >
                    <Plus className="h-3.5 w-3.5" /> বিষয় তৈরি করুন &ldquo;{debounced}&rdquo;
                  </button>
                </div>
              </CommandEmpty>
            )}

            {nodeResults.length > 0 && (
              <CommandGroup heading="টপিক ও সেকশন">
                {nodeResults.map((r, i) => (
                  <CommandItem
                    key={`node-${r.nodeId}-${i}`}
                    value={`node-${r.nodeId}-${i}`}
                    onSelect={() => jump(r.nodeId)}
                    className="gap-2"
                  >
                    <FolderOpen className="mr-1 h-4 w-4 shrink-0 text-chart-2" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bengali">{r.name}</span>
                      {r.path && (
                        <span className="block truncate text-[10px] text-muted-foreground font-bengali">
                          {r.path}
                        </span>
                      )}
                    </span>
                    {r.completed && (
                      <StickyNote className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {contentResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="নোট কনটেন্ট">
                  {contentResults.map((r, i) => (
                    <CommandItem
                      key={`content-${r.nodeId}-${i}`}
                      value={`content-${r.nodeId}-${i}`}
                      onSelect={() => jump(r.nodeId)}
                      className="gap-2"
                    >
                      <TextQuote className="mr-1 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium font-bengali">
                          {r.name}
                        </span>
                        {r.snippet && (
                          <span className="block truncate text-[10px] text-muted-foreground font-bengali">
                            {r.snippet}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {noteItemResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="নোট">
                  {noteItemResults.map((r, i) =>
                    row(
                      r,
                      `noteItem-${i}`,
                      <NotebookPen className="mr-1 h-4 w-4 shrink-0 text-primary" />,
                      r.title ?? r.name ?? ""
                    )
                  )}
                </CommandGroup>
              </>
            )}

            {questionResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="প্রশ্নব্যাংক">
                  {questionResults.map((r, i) =>
                    row(
                      r,
                      `question-${i}`,
                      <FileQuestion className="mr-1 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />,
                      r.title ?? r.name ?? ""
                    )
                  )}
                </CommandGroup>
              </>
            )}

            {mcqResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="MCQ">
                  {mcqResults.map((r, i) =>
                    row(
                      r,
                      `mcq-${i}`,
                      <ListChecks className="mr-1 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />,
                      r.title ?? r.name ?? ""
                    )
                  )}
                </CommandGroup>
              </>
            )}

            {flashcardResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="ফ্ল্যাশকার্ড">
                  {flashcardResults.map((r, i) =>
                    row(
                      r,
                      `flashcard-${i}`,
                      <Layers className="mr-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
                      r.title ?? r.name ?? ""
                    )
                  )}
                </CommandGroup>
              </>
            )}

            {documentResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="ফাইল">
                  {documentResults.map((r, i) => (
                    <CommandItem
                      key={`document-${i}`}
                      value={`document-${i}`}
                      onSelect={() => jumpTo(r)}
                      className="gap-2"
                    >
                      {docIcon(r.title)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {r.title ?? r.name}
                        </span>
                        {r.path && (
                          <span className="block truncate text-[10px] text-muted-foreground font-bengali">
                            {r.path}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {linkResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="লিংক">
                  {linkResults.map((r, i) => (
                    <CommandItem
                      key={`link-${i}`}
                      value={`link-${i}`}
                      onSelect={() => jumpTo(r)}
                      className="gap-2"
                    >
                      {linkIcon(r.snippet ?? "") || <Link2 className="mr-1 h-4 w-4 shrink-0 text-primary" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium font-bengali">
                          {r.title ?? r.name}
                        </span>
                        {r.snippet && (
                          <span
                            className="block truncate text-[10px] text-muted-foreground font-mono"
                            title={r.snippet}
                          >
                            {r.snippet}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {planResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="ক্যালেন্ডার পরিকল্পনা">
                  {planResults.map((r, i) =>
                    row(
                      r,
                      `plan-${i}`,
                      <CalendarCheck className="mr-1 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />,
                      r.title ?? r.name ?? ""
                    )
                  )}
                </CommandGroup>
              </>
            )}

            {favoriteResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="প্রিয়">
                  {favoriteResults.map((r, i) =>
                    row(
                      r,
                      `favorite-${i}`,
                      <Heart className="mr-1 h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400" />,
                      r.title ?? r.name ?? ""
                    )
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
