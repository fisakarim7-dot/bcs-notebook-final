"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Search,
  Sun,
  Moon,
  Monitor,
  Menu,
  NotebookPen,
  Command,
  GraduationCap,
  Laptop,
  DatabaseBackup,
  CalendarDays,
  Heart,
  Trash2,
  Sparkles,
  Sunrise,
  MoreHorizontal,
  PenLine,
  BarChart3,
  BookMarked,
  Newspaper,
  Network,
  MessagesSquare,
} from "lucide-react";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";
import { fetchBackupStatus, fetchFavorites, fetchFlashcards, fetchTrash } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BackupDialog } from "@/components/bcs/backup/backup-dialog";
import { TrashDialog } from "@/components/bcs/trash/trash-dialog";
import { NotificationBell } from "@/components/bcs/notifications/notification-bell";

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { setTheme } = useTheme();
  const {
    view,
    goDashboard,
    goStudy,
    goCalendar,
    goFavorites,
    goToday,
    goWritten,
    goAnalytics,
    goSyllabus,
    goAffairs,
    goGraph,
    goTutor,
    setSearchOpen,
    backupOpen,
    setBackupOpen,
    setTrashOpen,
  } = useBcsStore();

  const { data: backupStatus } = useQuery({
    queryKey: ["backup-status"],
    queryFn: fetchBackupStatus,
    staleTime: 60_000,
  });

  const { data: trashData } = useQuery({
    queryKey: ["trash"],
    queryFn: fetchTrash,
    staleTime: 15_000,
  });
  const trashCount = trashData?.count ?? 0;

  const { data: dueData } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: () => fetchFlashcards("due"),
    staleTime: 60_000,
  });
  const dueCount = dueData?.count ?? 0;

  const { data: favorites } = useQuery({
    queryKey: ["favorites"],
    queryFn: fetchFavorites,
    staleTime: 15_000,
  });
  const favCount = favorites?.length ?? 0;

  const days = backupStatus?.daysSince ?? null;
  // green ≤3d · amber 4–6d · red (never / ≥7d)
  const dotCls =
    days == null || days >= 7
      ? "bg-red-500 animate-pulse"
      : days >= 4
        ? "bg-amber-500"
        : "bg-emerald-500";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSearchOpen]);

  return (
    <header className="glass z-40 flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open tree sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <button
        onClick={goDashboard}
        className="group flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-start transition-colors hover:bg-accent/50"
      >
        <span className="pulse-glow glass-strong flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105">
          <NotebookPen className="h-4.5 w-4.5 text-primary" />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-[15px] font-bold leading-tight tracking-tight">
            <span className="text-gradient">BCS Written</span>{" "}
            <span className="text-foreground/90">Tree-Notebook</span>
          </span>
          <span className="block truncate text-[11px] font-bengali leading-tight text-muted-foreground">
            ছয়-স্তরের ইন্টারেক্টিভ নোটবুক
          </span>
        </span>
      </button>

      <div className="mx-auto w-full max-w-md px-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="glass flex h-9 w-full items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_16px_var(--glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="প্রিমিয়াম সার্চ"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden truncate font-bengali sm:block">প্রিমিয়াম সার্চ…</span>
          <span className="hidden font-bengali text-[11px] sm:block">সব টেক্সটে খুঁজুন</span>
          <Badge variant="outline" className="ml-auto hidden gap-1 font-mono text-[10px] sm:flex">
            <Command className="h-3 w-3" />K
          </Badge>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="glass hidden items-center rounded-xl p-0.5 sm:flex" role="tablist" aria-label="Main view">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                role="tab"
                aria-selected={view === "today"}
                onClick={goToday}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-300",
                  view === "today"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sunrise className="h-3.5 w-3.5" />
                Today
              </button>
            </TooltipTrigger>
            <TooltipContent>Today's command center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                role="tab"
                aria-selected={view === "dashboard"}
                onClick={goDashboard}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-300",
                  view === "dashboard"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </button>
            </TooltipTrigger>
            <TooltipContent>Study dashboard & analytics</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                role="tab"
                aria-selected={view === "study"}
                onClick={goStudy}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-300",
                  view === "study"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Revision
                {dueCount > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                      view === "study" ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
                    )}
                  >
                    {toBn(dueCount)}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>Flashcards, MCQs & mock tests</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                role="tab"
                aria-selected={view === "calendar"}
                onClick={goCalendar}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-300",
                  view === "calendar"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Calendar
              </button>
            </TooltipTrigger>
            <TooltipContent>Daily study plan & success stats</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                role="tab"
                aria-selected={view === "favorites"}
                onClick={goFavorites}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-300",
                  view === "favorites"
                    ? "bg-fuchsia-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Heart
                  className="h-3.5 w-3.5"
                  fill={favCount > 0 ? "currentColor" : "none"}
                />
                Favorites
                {favCount > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                      view === "favorites" ? "bg-white text-fuchsia-700" : "bg-fuchsia-500 text-white"
                    )}
                  >
                    {toBn(favCount)}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>All 💜 favorites in one place</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-300",
              view === "node"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <NotebookPen className="h-3.5 w-3.5" />
            Workspace
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-all",
                  ["written", "analytics", "syllabus", "affairs", "graph", "tutor"].includes(view)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label="More tools"
              >
                <MoreHorizontal className="h-3.5 w-3.5" /> More
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-strong w-52">
              <DropdownMenuItem onClick={goWritten} className="gap-2">
                <PenLine className="h-4 w-4" /> Written Studio
              </DropdownMenuItem>
              <DropdownMenuItem onClick={goAnalytics} className="gap-2">
                <BarChart3 className="h-4 w-4" /> Weakness Radar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={goSyllabus} className="gap-2">
                <BookMarked className="h-4 w-4" /> Syllabus Checklist
              </DropdownMenuItem>
              <DropdownMenuItem onClick={goAffairs} className="gap-2">
                <Newspaper className="h-4 w-4" /> Current Affairs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={goGraph} className="gap-2">
                <Network className="h-4 w-4" /> Knowledge Graph
              </DropdownMenuItem>
              <DropdownMenuItem onClick={goTutor} className="gap-2">
                <MessagesSquare className="h-4 w-4" /> Note-Tutor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="glass-strong hidden h-9 w-9 rounded-xl sm:inline-flex"
              aria-label="Download offline laptop package (ZIP)"
              onClick={() => {
                // Versioned pack comes from /api/laptop-pack with
                // Content-Disposition + no-store — a stale cached ZIP is impossible.
                const a = document.createElement("a");
                a.href = "/api/laptop-pack";
                a.rel = "noopener";
                a.click();
              }}
            >
              <Laptop className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>ল্যাপটপ প্যাক (ZIP) ডাউনলোড — অফলাইনে চালান</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="glass-strong relative h-9 w-9 rounded-xl"
              aria-label={`ট্র্যাশ${trashCount ? ` — ${toBn(trashCount)}টি আইটেম` : ""}`}
              onClick={() => setTrashOpen(true)}
            >
              <Trash2 className={cn("h-4 w-4", trashCount > 0 && "text-rose-500")} />
              {trashCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-background">
                  {trashCount > 9 ? "৯+" : toBn(trashCount)}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="font-bengali">ট্র্যাশ — নিরাপদ ডিলিট (ফেরানো যায়)</TooltipContent>
        </Tooltip>

        <NotificationBell />

        <div className="relative hidden sm:block">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="glass-strong h-9 w-9 rounded-xl"
                aria-label="ব্যাকআপ ও রিস্টোর"
                onClick={() => setBackupOpen(true)}
              >
                <DatabaseBackup className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-center">
              <p className="font-bengali">ব্যাকআপ ও রিস্টোর</p>
              {days == null ? (
                <p className="text-[10px] font-bengali text-red-400">এখনো ব্যাকআপ নেওয়া হয়নি</p>
              ) : (
                <p className="text-[10px] font-bengali text-muted-foreground">
                  শেষ ব্যাকআপ: {toBn(days)} দিন আগে
                </p>
              )}
            </TooltipContent>
          </Tooltip>
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
              dotCls
            )}
            aria-hidden
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="glass-strong hidden h-9 w-9 rounded-xl sm:inline-flex" aria-label="Change theme">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform duration-300 dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform duration-300 dark:rotate-0 dark:scale-100" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong">
            <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
              <Sun className="h-4 w-4" /> Light <span className="ml-auto text-[10px] text-muted-foreground">warm cream</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
              <Moon className="h-4 w-4" /> Dark <span className="ml-auto text-[10px] text-muted-foreground">deep slate</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
              <Monitor className="h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Phone-only (⋯) overflow menu — theme + backup live here so the bar never overflows */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="glass-strong h-9 w-9 rounded-xl sm:hidden" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-48">
            <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
              <Sun className="h-4 w-4" /> Light theme
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
              <Moon className="h-4 w-4" /> Dark theme
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
              <Monitor className="h-4 w-4" /> System theme
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBackupOpen(true)} className="gap-2">
              <DatabaseBackup className="h-4 w-4" /> Backup & Restore
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
      <TrashDialog />
    </header>
  );
}
