"use client";

// Safe Delete System (#21) — ট্র্যাশ ডায়ালগ।
// Delete → Trash → Restore → Permanent Delete ফ্লো-এর UI।
// সব ধরনের কনটেন্ট (টপিক/নোট/ফাইল/লিংক/প্রশ্ন/কার্ড/MCQ) এক তালিকায়,
// ধরন-ভিত্তিক ফিল্টার চিপ, ফেরানো / চিরতরে মুছে ফেলা / সব খালি, এবং
// কনফিগারেবল অটো-পার্জ (কত দিন পরে নিজে থেকে মুছে যাবে)।
import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyTrash,
  fetchTrash,
  permanentDeleteTrashItem,
  restoreTrashItem,
  setTrashAutoPurge,
  type TrashItemDTO,
} from "@/lib/bcs-api";
import { useBcsStore } from "@/lib/bcs-store";
import { toBn, formatBytes } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import {
  Clock,
  FileText,
  FileQuestion,
  FolderTree,
  Layers,
  Link2,
  Loader2,
  RotateCcw,
  StickyNote,
  Trash2,
  WalletCards,
} from "lucide-react";

const deletedFmt = new Intl.DateTimeFormat("bn-BD", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** kind → chip config (7-hue system, matches the app's colorful chips). */
const KIND_META: Record<
  TrashItemDTO["kind"],
  { label: string; icon: ComponentType<{ className?: string }>; chip: string }
> = {
  node: { label: "টপিক/সেকশন", icon: FolderTree, chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  noteItem: { label: "নোট", icon: StickyNote, chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  document: { label: "ফাইল", icon: FileText, chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  link: { label: "লিংক", icon: Link2, chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  question: { label: "প্রশ্ন", icon: FileQuestion, chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  questionAttachment: { label: "উত্তর-সোর্স", icon: PaperclipIcon, chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  flashcard: { label: "ফ্ল্যাশকার্ড", icon: Layers, chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30" },
  mcq: { label: "MCQ", icon: WalletCards, chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
};

// tiny inline alias so the map above stays tidy
function PaperclipIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

const PURGE_OPTIONS = [
  { value: "0", label: "কখনো না (নিজে থেকে মুছবে না)" },
  { value: "7", label: `${toBn(7)} দিন পরে` },
  { value: "30", label: `${toBn(30)} দিন পরে` },
  { value: "90", label: `${toBn(90)} দিন পরে` },
];

export function TrashDialog() {
  const open = useBcsStore((s) => s.trashOpen);
  const setOpen = useBcsStore((s) => s.setTrashOpen);
  const qc = useQueryClient();
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [confirmItem, setConfirmItem] = useState<TrashItemDTO | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: fetchTrash,
    enabled: open,
    staleTime: 5_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    qc.invalidateQueries({ queryKey: ["tree"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["note-items"] });
    qc.invalidateQueries({ queryKey: ["questions"] });
    qc.invalidateQueries({ queryKey: ["flashcards"] });
    qc.invalidateQueries({ queryKey: ["mcqs"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const doRestore = useMutation({
    mutationFn: (id: string) => restoreTrashItem(id),
    onSuccess: (d) => {
      toast.success("ফেরত এসেছে ✓", { description: d.message });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doPermanent = useMutation({
    mutationFn: (id: string) => permanentDeleteTrashItem(id),
    onSuccess: () => {
      toast.success("চিরতরে মুছে ফেলা হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doEmpty = useMutation({
    mutationFn: () => emptyTrash(),
    onSuccess: (d) => {
      toast.success(`ট্র্যাশ খালি — ${toBn(d.removed)}টি আইটেম চিরতরে মুছে গেছে`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doSetPurge = useMutation({
    mutationFn: (days: number) => setTrashAutoPurge(days),
    onSuccess: () => {
      toast.success("অটো-পার্জ সেটিং সংরক্ষিত হয়েছে");
      qc.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const kindsPresent = useMemo(() => {
    const set = new Set(items.map((i) => i.kind));
    return [...set];
  }, [items]);
  const filtered = useMemo(
    () => (kindFilter === "all" ? items : items.filter((i) => i.kind === kindFilter)),
    [items, kindFilter]
  );

  const busy = doRestore.isPending || doPermanent.isPending || doEmpty.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong max-w-xl gap-0 overflow-hidden p-0">
          {/* gradient signature shell */}
          <div className="p-[2.5px] [background:linear-gradient(135deg,#f43f5e33,#f59e0b33,#10b98133,#3b82f633)]">
            <div className="rounded-[calc(1.25rem-2.5px)] bg-background/95 p-5 dark:bg-background/90">
              <DialogHeader className="space-y-1.5 text-left">
                <DialogTitle className="flex items-center gap-2 font-bengali text-base">
                  <span className="glass-strong flex h-8 w-8 items-center justify-center rounded-lg">
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </span>
                  ট্র্যাশ — নিরাপদ ডিলিট
                </DialogTitle>
                <DialogDescription className="font-bengali text-xs">
                  মোছা প্রতিটি আইটেম আগে এখানে আসে। ভুল হলে ফেরান, নিশ্চিত হলে চিরতরে মুছুন।
                </DialogDescription>
              </DialogHeader>

              {/* stats strip */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bengali text-muted-foreground">
                <Badge variant="outline" className="gap-1 border-rose-500/30 bg-rose-500/10 font-bengali text-rose-600 dark:text-rose-300">
                  <Trash2 className="h-3 w-3" /> {toBn(data?.count ?? 0)}টি আইটেম
                </Badge>
                {data && data.totalBytes > 0 && (
                  <Badge variant="outline" className="gap-1 font-bengali">
                    <WalletCards className="h-3 w-3" /> {formatBytes(data.totalBytes)}
                  </Badge>
                )}
                <div className="ms-auto flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span className="hidden sm:inline">অটো-পার্জ:</span>
                  <Select
                    value={String(data?.autoPurgeDays ?? 0)}
                    onValueChange={(v) => doSetPurge.mutate(Number(v))}
                  >
                    <SelectTrigger
                      className="h-7 w-[150px] gap-1 font-bengali text-[11px] sm:w-[190px]"
                      aria-label="অটো-পার্জ সময়সীমা"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-strong font-bengali">
                      {PURGE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* kind filter chips */}
              {kindsPresent.length > 1 && (
                <div className="scroll-slim mt-3 flex gap-1.5 overflow-x-auto pb-1">
                  <FilterChip
                    active={kindFilter === "all"}
                    onClick={() => setKindFilter("all")}
                    label={`সব (${toBn(items.length)})`}
                  />
                  {kindsPresent.map((k) => (
                    <FilterChip
                      key={k}
                      active={kindFilter === k}
                      onClick={() => setKindFilter(k)}
                      label={`${KIND_META[k].label} (${toBn(items.filter((i) => i.kind === k).length)})`}
                    />
                  ))}
                </div>
              )}

              {/* list */}
              <ScrollArea className="scroll-slim mt-3 max-h-[46vh] min-h-[120px] pr-1">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 font-bengali text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <span className="glass-strong float-soft flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Trash2 className="h-5 w-5 text-emerald-500" />
                    </span>
                    <p className="text-sm font-semibold font-bengali">ট্র্যাশ খালি</p>
                    <p className="max-w-[260px] text-xs font-bengali text-muted-foreground">
                      কিছু মুছলে সেটি আগে এখানে জমা হবে — চিরতরে মোছার আগে ফেরানোর সুযোগ থাকবে।
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {filtered.map((item) => {
                      const meta = KIND_META[item.kind] ?? KIND_META.node;
                      const Icon = meta.icon;
                      return (
                        <li
                          key={item.id}
                          className="glass group flex min-w-0 max-w-full flex-col gap-2 rounded-xl p-3 transition-shadow hover:shadow-[0_0_16px_var(--glow)]"
                        >
                          <div className="flex min-w-0 max-w-full items-start gap-2.5">
                          <span className="glass-strong mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <Badge variant="outline" className={cn("h-4.5 shrink-0 px-1.5 text-[9px] font-bengali", meta.chip)}>
                                  {meta.label}
                                </Badge>
                                <p
                                  className="min-w-0 flex-1 overflow-hidden break-words text-[13px] font-semibold font-bengali [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                                  title={item.title}
                                >
                                  {item.title}
                                </p>
                              </div>
                            {item.path && (
                              <p className="mt-0.5 truncate text-[10.5px] font-bengali text-muted-foreground" title={item.path}>
                                {item.path}
                              </p>
                            )}
                            <p className="mt-0.5 text-[10.5px] font-bengali text-muted-foreground/80">
                              {item.summary ? `${item.summary} · ` : ""}
                              {deletedFmt.format(new Date(item.deletedAt))} এ মোছা হয়েছে
                              {item.sizeBytes > 0 ? ` · ${formatBytes(item.sizeBytes)}` : ""}
                            </p>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-lg font-bengali text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400"
                              disabled={busy}
                              onClick={() => doRestore.mutate(item.id)}
                            >
                              {doRestore.isPending && doRestore.variables === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              ফেরান
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-lg font-bengali text-red-500 hover:bg-red-500/15 hover:text-red-600"
                              disabled={busy}
                              onClick={() => setConfirmItem(item)}
                            >
                              {doPermanent.isPending && doPermanent.variables === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              চিরতরে মুছুন
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>

              {/* footer actions */}
              {items.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="hidden text-[10.5px] font-bengali leading-tight text-muted-foreground sm:block">
                    রিস্টোরে আইডি অপরিবর্তিত থাকে — প্রিয়/সংযোগ/প্ল্যান সব ফেরত আসে
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ms-auto gap-1.5 border-red-500/40 font-bengali text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                    disabled={busy}
                    onClick={() => setConfirmEmpty(true)}
                  >
                    {doEmpty.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    সব খালি করুন
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* permanent delete confirm */}
      <AlertDialog open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">চিরতরে মুছে ফেলা হবে!</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              “{confirmItem?.title}” এবং এর সব সম্পর্কিত রিসোর্স স্থায়ীভাবে মুছে যাবে —
              এটি আর ফেরানো যাবে না। নিশ্চিত?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-bengali text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmItem) doPermanent.mutate(confirmItem.id);
                setConfirmItem(null);
              }}
            >
              হ্যাঁ, চিরতরে মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* empty-trash confirm */}
      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">পুরো ট্র্যাশ খালি করবেন?</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              ট্র্যাশে থাকা সব {toBn(items.length)}টি আইটেম ও তাদের ফাইল স্থায়ীভাবে মুছে যাবে —
              এটি আর ফেরানো যাবে না। নিশ্চিত?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-bengali text-white hover:bg-destructive/90"
              onClick={() => {
                doEmpty.mutate();
                setConfirmEmpty(false);
              }}
            >
              হ্যাঁ, সব খালি করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bengali transition-colors",
        active
          ? "border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-300"
          : "border-border/60 text-muted-foreground hover:bg-accent/60"
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
