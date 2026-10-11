"use client";

import { useState } from "react";
import {
  BarChart3,
  BookMarked,
  CalendarDays,
  GraduationCap,
  Heart,
  LayoutDashboard,
  MessagesSquare,
  MoreHorizontal,
  Network,
  Newspaper,
  PenLine,
  Sunrise,
  TreePine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBcsStore } from "@/lib/bcs-store";
import { fetchFavorites, fetchFlashcards } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Phone-only (< sm) bottom navigation.
 * Exposes the 5 most-used views inline plus a "More" sheet for the rest,
 * so EVERY feature is reachable on a phone (previously Written / Analytics /
 * Syllabus / Affairs / Graph / Tutor / Dashboard had no mobile entry point).
 */
export function MobileNav() {
  const { view, goToday, goStudy, goCalendar, goFavorites, goNode, goDashboard, goWritten, goAnalytics, goSyllabus, goAffairs, goGraph, goTutor } = useBcsStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: favorites } = useQuery({ queryKey: ["favorites"], queryFn: fetchFavorites, staleTime: 15_000 });
  const favCount = favorites?.length ?? 0;
  const { data: dueData } = useQuery({ queryKey: ["flashcards", "due"], queryFn: () => fetchFlashcards("due"), staleTime: 60_000 });
  const dueCount = dueData?.count ?? 0;

  const item = (active: boolean) =>
    cn(
      "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium leading-none transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  const secondary: { label: string; icon: typeof PenLine; onClick: () => void; active: boolean }[] = [
    { label: "Dashboard", icon: LayoutDashboard, onClick: goDashboard, active: view === "dashboard" },
    { label: "Written", icon: PenLine, onClick: goWritten, active: view === "written" },
    { label: "Radar", icon: BarChart3, onClick: goAnalytics, active: view === "analytics" },
    { label: "Syllabus", icon: BookMarked, onClick: goSyllabus, active: view === "syllabus" },
    { label: "Affairs", icon: Newspaper, onClick: goAffairs, active: view === "affairs" },
    { label: "Graph", icon: Network, onClick: goGraph, active: view === "graph" },
    { label: "Note-Tutor", icon: MessagesSquare, onClick: goTutor, active: view === "tutor" },
  ];

  const moreActive = secondary.some((s) => s.active);

  return (
    <>
      <nav
        className="glass z-40 shrink-0 border-x-0 border-b-0 sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary mobile navigation"
      >
        <div className="flex items-stretch gap-1 px-2 py-1.5">
          <button className={item(view === "today")} onClick={goToday} aria-label="Today">
            <Sunrise className="h-5 w-5" />
            Today
          </button>
          <button className={item(view === "study")} onClick={goStudy} aria-label="Revision hub">
            <GraduationCap className="h-5 w-5" />
            Revision
            {dueCount > 0 && (
              <span className="absolute right-1/2 top-0.5 flex h-3.5 min-w-3.5 translate-x-3 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                {dueCount > 9 ? "9+" : toBn(dueCount)}
              </span>
            )}
          </button>
          <button className={item(view === "node")} onClick={goNode} aria-label="Tree workspace">
            <TreePine className="h-5 w-5" />
            Tree
          </button>
          <button className={item(view === "calendar")} onClick={goCalendar} aria-label="Calendar">
            <CalendarDays className="h-5 w-5" />
            Calendar
          </button>
          <button className={item(view === "favorites")} onClick={goFavorites} aria-label="Favorites">
            <Heart className="h-5 w-5" fill={favCount > 0 ? "currentColor" : "none"} />
            Favorites
            {favCount > 0 && (
              <span className="absolute right-1/2 top-0.5 flex h-3.5 min-w-3.5 translate-x-3 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[8px] font-bold text-white">
                {favCount > 9 ? "9+" : toBn(favCount)}
              </span>
            )}
          </button>
          <button className={item(moreActive)} onClick={() => setMoreOpen(true)} aria-label="More tools">
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="glass-strong rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:max-w-none">
          <SheetTitle className="px-1 pb-2 text-sm font-semibold">আরও টুলস</SheetTitle>
          <div className="grid grid-cols-4 gap-2">
            {secondary.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  s.onClick();
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-medium transition-colors",
                  s.active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <s.icon className="h-5 w-5" />
                {s.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
