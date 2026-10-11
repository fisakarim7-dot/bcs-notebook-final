"use client";

// Notifications (#29) — 🔔 bell + popover panel + configurable settings dialog.
// Notifications are COMPUTED from live data (server engine: bcs-notifications.ts):
// due revision, weekly progress, stale subjects, exam countdown, backup reminder,
// trash pending. Opening the panel marks everything read (unread badge clears).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCheck,
  DatabaseBackup,
  History,
  PartyPopper,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  saveNotificationSettings,
  type NotificationItemDTO,
  type NotifSettingsDTO,
} from "@/lib/bcs-api";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  RefreshCw,
  PartyPopper,
  History,
  CalendarClock,
  DatabaseBackup,
  Trash2,
};

const LEVEL_STYLE: Record<
  NotificationItemDTO["level"],
  { chip: string; dot: string }
> = {
  info: { chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300", dot: "bg-sky-500" },
  success: { chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", dot: "bg-emerald-500" },
  warning: { chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300", dot: "bg-amber-500" },
};

const TYPE_LABEL: Record<NotificationItemDTO["type"], string> = {
  "due-revision": "রিভিশন",
  "weekly-progress": "সাপ্তাহিক অগ্রগতি",
  "stale-subject": "অবহেলিত বিষয়",
  "exam-soon": "পরীক্ষা",
  "backup-due": "ব্যাকআপ",
  "trash-pending": "ট্র্যাশ",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const qc = useQueryClient();
  const goNotifView = useBcsStore((s) => s.goNotifView);
  const setBackupOpen = useBcsStore((s) => s.setBackupOpen);
  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 30_000,
    refetchInterval: 120_000, // gentle re-computation while the app is open
  });

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // opening the panel marks everything as read (classic bell behavior)
  useEffect(() => {
    if (open && unread > 0) {
      markAll.mutate();
    }
  }, [open]);

  const runAction = (item: NotificationItemDTO) => {
    const a = item.action;
    if (!a) return;
    if (a.kind === "dialog") {
      if (a.dialog === "backup") setBackupOpen(true);
      if (a.dialog === "trash") setTrashOpen(true);
    } else if (a.kind === "view" && a.view) {
      goNotifView(a.view, a.nodeId ?? null);
    }
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="glass-strong relative h-9 w-9 rounded-xl"
                aria-label={`নোটিফিকেশন${unread ? ` — ${unread}টি নতুন` : ""}`}
              >
                <Bell className={cn("h-4 w-4 transition-transform duration-300", open && "scale-110 text-primary")} />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-background">
                    {unread > 9 ? "৯+" : unread.toLocaleString("bn-BD")}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="font-bengali">নোটিফিকেশন</TooltipContent>
        </Tooltip>

        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[min(92vw,360px)] overflow-hidden p-0"
        >
          {/* gradient signature shell */}
          <div className="p-[2.5px] [background:linear-gradient(135deg,#f43f5e33,#f59e0b33,#10b98133,#3b82f633)]">
            <div className="rounded-[calc(0.75rem-2.5px)] bg-background/95 p-3.5 dark:bg-background/90">
              <div className="flex items-center gap-2">
                <span className="glass-strong flex h-8 w-8 items-center justify-center rounded-lg">
                  <Bell className="h-4 w-4 text-amber-500" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold font-bengali leading-tight">নোটিফিকেশন</p>
                  <p className="text-[10.5px] font-bengali leading-tight text-muted-foreground">
                    আপনার পড়ার হিসাব থেকে স্বয়ংক্রিয়ভাবে তৈরি
                  </p>
                </div>
                <div className="ms-auto flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => markAll.mutate()}
                        disabled={markAll.isPending || unread === 0}
                        aria-label="সব পড়া হয়েছে"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bengali">সব পড়া হয়েছে</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => setSettingsOpen(true)}
                        aria-label="নোটিফিকেশন সেটিংস"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bengali">সেটিংস</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <ScrollArea className="scroll-slim mt-2.5 max-h-[52vh]">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <span className="glass-strong float-soft flex h-11 w-11 items-center justify-center rounded-2xl">
                      <BellOff className="h-4.5 w-4.5 text-emerald-500" />
                    </span>
                    <p className="text-[13px] font-semibold font-bengali">কোনো নোটিফিকেশন নেই</p>
                    <p className="max-w-[220px] text-[11px] font-bengali text-muted-foreground">
                      রিভিশন বাকি, অগ্রগতি বা পরীক্ষার কাউন্টডাউন — কিছু গুরুত্বপূর্ণ হলে এখানে দেখা যাবে।
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1.5 pr-1">
                    {items.map((item) => {
                      const Icon = ICONS[item.icon] ?? Bell;
                      const style = LEVEL_STYLE[item.level];
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => runAction(item)}
                            className="glass group flex w-full items-start gap-2.5 rounded-xl p-2.5 text-start transition-all hover:border-primary/40 hover:shadow-[0_0_16px_var(--glow)]"
                            aria-label={item.title}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                style.chip
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12.5px] font-medium font-bengali leading-snug">
                                {item.title}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5">
                                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
                                <span className="text-[10px] font-bengali text-muted-foreground">
                                  {TYPE_LABEL[item.type]}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <NotifSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initial={data?.settings ?? null}
      />
    </>
  );
}

// ---------------- settings dialog (configurable system) ----------------

function NotifSettingsDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: NotifSettingsDTO | null;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<NotifSettingsDTO | null>(initial);
  // render-phase reset: every time the dialog (re)opens, re-seed the draft from `initial`
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial);
  }

  const save = useMutation({
    mutationFn: (s: NotifSettingsDTO) => saveNotificationSettings(s),
    onSuccess: () => {
      toast.success("নোটিফিকেশন সেটিংস সংরক্ষিত হয়েছে");
      qc.invalidateQueries({ queryKey: ["notifications"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = draft;
  const patch = (p: Partial<NotifSettingsDTO>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-md p-0 overflow-hidden">
        <div className="p-[2.5px] [background:linear-gradient(135deg,#f43f5e33,#f59e0b33,#10b98133,#3b82f633)]">
          <div className="rounded-[calc(1.25rem-2.5px)] bg-background/95 p-5 dark:bg-background/90">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="flex items-center gap-2 font-bengali text-base">
                <span className="glass-strong flex h-8 w-8 items-center justify-center rounded-lg">
                  <Settings2 className="h-4 w-4 text-primary" />
                </span>
                নোটিফিকেশন সেটিংস
              </DialogTitle>
              <DialogDescription className="font-bengali text-xs">
                কোন ধরনের সূচনা দেখবেন তা আপনি ঠিক করুন — সবকিছু কনফিগারেবল।
              </DialogDescription>
            </DialogHeader>

            {s && (
              <div className="mt-3 space-y-2.5">
                {/* master switch */}
                <Row
                  title="সব নোটিফিকেশন"
                  desc="বন্ধ করলে ঘণ্টায় কিছুই দেখাবে না"
                >
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) => patch({ enabled: v })}
                    aria-label="সব নোটিফিকেশন চালু/বন্ধ"
                  />
                </Row>

                <div className={cn("space-y-2.5 transition-opacity", !s.enabled && "pointer-events-none opacity-50")}>
                  <Row title="রিভিশন বাকি" desc="ফ্ল্যাশকার্ড ডিউ + MCQ রিভিশন">
                    <Switch
                      checked={s.dueRevision.on}
                      onCheckedChange={(v) => patch({ dueRevision: { ...s.dueRevision, on: v } })}
                      aria-label="রিভিশন নোটিফিকেশন"
                    />
                  </Row>
                  <Row title="সাপ্তাহিক অগ্রগতি" desc="এই সপ্তাহে কতটি টপিক সম্পন্ন">
                    <Switch
                      checked={s.weeklyProgress.on}
                      onCheckedChange={(v) => patch({ weeklyProgress: { on: v } })}
                      aria-label="সাপ্তাহিক অগ্রগতি নোটিফিকেশন"
                    />
                  </Row>
                  <Row title="অবহেলিত বিষয়" desc="দীর্ঘদিন রিভিশন হয়নি এমন বিষয়">
                    <Switch
                      checked={s.staleSubject.on}
                      onCheckedChange={(v) => patch({ staleSubject: { ...s.staleSubject, on: v } })}
                      aria-label="অবহেলিত বিষয় নোটিফিকেশন"
                    />
                    <Select
                      value={String(s.staleSubject.days)}
                      onValueChange={(v) => patch({ staleSubject: { ...s.staleSubject, days: Number(v) } })}
                    >
                      <SelectTrigger className="h-8 w-[86px] font-bengali text-[11px]" aria-label="কত দিন পরে সূচনা">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-strong font-bengali">
                        {["3", "5", "7", "10", "14"].map((d) => (
                          <SelectItem key={d} value={d}>
                            {Number(d).toLocaleString("bn-BD")} দিন
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Row>
                  <Row title="পরীক্ষার কাউন্টডাউন" desc="আগামী পরীক্ষার সূচনা">
                    <Switch
                      checked={s.examSoon.on}
                      onCheckedChange={(v) => patch({ examSoon: { ...s.examSoon, on: v } })}
                      aria-label="পরীক্ষার নোটিফিকেশন"
                    />
                    <Select
                      value={String(s.examSoon.withinDays)}
                      onValueChange={(v) => patch({ examSoon: { ...s.examSoon, withinDays: Number(v) } })}
                    >
                      <SelectTrigger className="h-8 w-[86px] font-bengali text-[11px]" aria-label="কত দিনের মধ্যে">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-strong font-bengali">
                        {[["7", "৭ দিনের মধ্যে"], ["15", "১৫ দিনের মধ্যে"], ["30", "৩০ দিনের মধ্যে"], ["60", "৬০ দিনের মধ্যে"]].map(
                          ([v, label]) => (
                            <SelectItem key={v} value={v}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </Row>
                  <Row title="ব্যাকআপ সূচনা" desc="দীর্ঘদিন ব্যাকআপ হয়নি">
                    <Switch
                      checked={s.backup.on}
                      onCheckedChange={(v) => patch({ backup: { ...s.backup, on: v } })}
                      aria-label="ব্যাকআপ নোটিফিকেশন"
                    />
                    <Select
                      value={String(s.backup.days)}
                      onValueChange={(v) => patch({ backup: { ...s.backup, days: Number(v) } })}
                    >
                      <SelectTrigger className="h-8 w-[86px] font-bengali text-[11px]" aria-label="কত দিন পরে ব্যাকআপ সূচনা">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-strong font-bengali">
                        {["3", "7", "14"].map((d) => (
                          <SelectItem key={d} value={d}>
                            {Number(d).toLocaleString("bn-BD")} দিন
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Row>
                  <Row title="ট্র্যাশ সূচনা" desc="ট্র্যাশে অপেক্ষমাণ আইটেম">
                    <Switch
                      checked={s.trash.on}
                      onCheckedChange={(v) => patch({ trash: { on: v } })}
                      aria-label="ট্র্যাশ নোটিফিকেশন"
                    />
                  </Row>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" className="font-bengali" onClick={() => onOpenChange(false)}>
                    বাতিল
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 font-bengali"
                    disabled={save.isPending}
                    onClick={() => s && save.mutate(s)}
                  >
                    সংরক্ষণ করুন
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass flex items-center gap-2.5 rounded-xl p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold font-bengali leading-tight">{title}</p>
        <p className="text-[10px] font-bengali leading-tight text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
