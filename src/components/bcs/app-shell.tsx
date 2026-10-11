"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Topbar } from "@/components/bcs/topbar";
import { MobileNav } from "@/components/bcs/mobile-nav";
import { TreeSidebar } from "@/components/bcs/tree/tree-sidebar";
import { Workspace } from "@/components/bcs/workspace/workspace";
import { Dashboard } from "@/components/bcs/dashboard/dashboard";
import { StudyHub } from "@/components/bcs/study/study-hub";
import { CalendarHub } from "@/components/bcs/calendar/calendar-hub";
import { FavoritesHub } from "@/components/bcs/favorites/favorites-hub";
import { SearchDialog } from "@/components/bcs/search/search-dialog";
import { TodayHub } from "@/components/bcs/today/today-hub";
import { WrittenStudio } from "@/components/bcs/written/written-studio";
import { RadarHub } from "@/components/bcs/analytics/radar-hub";
import { SyllabusHub } from "@/components/bcs/syllabus/syllabus-hub";
import { AffairsDesk } from "@/components/bcs/affairs/affairs-desk";
import { KnowledgeGraph } from "@/components/bcs/graph/knowledge-graph";
import { TutorPanel } from "@/components/bcs/tutor/tutor-panel";
import { useBcsStore } from "@/lib/bcs-store";
import { fetchStats, fetchTree } from "@/lib/bcs-api";
import { formatBytes } from "@/lib/bcs-types";
import { Database, ShieldCheck, TreePine } from "lucide-react";

export function AppShell() {
  const { view, sidebarOpenMobile, setSidebarOpenMobile, setSearchOpen } = useBcsStore();

  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });

  // keyboard: "/" focuses search, Esc handled by dialogs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSearchOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Topbar onOpenSidebar={() => setSidebarOpenMobile(true)} />

      <div className="flex min-h-0 flex-1 px-2 pb-2 pt-2 sm:px-3">
        <ResizablePanelGroup direction="horizontal" id="bcs-split" className="flex-1 gap-0">
          {/* Tree sidebar — desktop */}
          <ResizablePanel
            id="bcs-tree"
            defaultSize={22}
            minSize={15}
            maxSize={38}
            className="hidden lg:block"
          >
            <aside className="glass mr-0 h-full rounded-2xl" aria-label="Study tree sidebar">
              <TreeSidebar />
            </aside>
          </ResizablePanel>

          <ResizableHandle withHandle className="mx-1 hidden lg:flex" />

          {/* Main area */}
          <ResizablePanel id="bcs-main" defaultSize={78}>
            <main className="flex h-full min-h-0 flex-col" aria-label="Study workspace">
              <AnimatePresence mode="wait">
                {view === "today" ? (
                  <motion.div
                    key="today"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-0.5"
                  >
                    <TodayHub />
                  </motion.div>
                ) : view === "written" ? (
                  <motion.div key="written" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <WrittenStudio />
                  </motion.div>
                ) : view === "analytics" ? (
                  <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <RadarHub />
                  </motion.div>
                ) : view === "syllabus" ? (
                  <motion.div key="syllabus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <SyllabusHub />
                  </motion.div>
                ) : view === "affairs" ? (
                  <motion.div key="affairs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <AffairsDesk />
                  </motion.div>
                ) : view === "graph" ? (
                  <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <KnowledgeGraph />
                  </motion.div>
                ) : view === "tutor" ? (
                  <motion.div key="tutor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
                    <TutorPanel />
                  </motion.div>
                ) : view === "dashboard" ? (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-0.5"
                  >
                    <Dashboard />
                  </motion.div>
                ) : view === "study" ? (
                  <motion.div
                    key="study"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto"
                  >
                    <StudyHub />
                  </motion.div>
                ) : view === "calendar" ? (
                  <motion.div
                    key="calendar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-0.5"
                  >
                    <CalendarHub />
                  </motion.div>
                ) : view === "favorites" ? (
                  <motion.div
                    key="favorites"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-0.5"
                  >
                    <FavoritesHub />
                  </motion.div>
                ) : (
                  <motion.div
                    key="workspace"
                    className="flex min-h-0 flex-1 flex-col"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Workspace />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Sticky status footer */}
      <footer className="glass z-30 mt-auto hidden h-9 shrink-0 items-center gap-3 border-x-0 border-b-0 px-3 text-[11px] text-muted-foreground sm:flex sm:px-4">
        <span className="flex items-center gap-1.5">
          <TreePine className="h-3.5 w-3.5 text-primary" />
          {nodes.length} nodes
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Database className="h-3.5 w-3.5 text-primary" />
          Vault {formatBytes(stats?.totals.storageBytes ?? 0)}
        </span>
        <span className="ml-auto flex items-center gap-1.5" title="Everything is stored on your device">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">All tree structure, notes & uploads persist automatically</span>
          <span className="sm:hidden">Auto-persisted</span>
        </span>
      </footer>

      {/* Phone-only bottom navigation (replaces the desktop footer) */}
      <MobileNav />

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpenMobile} onOpenChange={setSidebarOpenMobile}>
        <SheetContent side="left" className="glass-strong w-[86vw] max-w-xs p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">Study tree</SheetTitle>
          <TreeSidebar />
        </SheetContent>
      </Sheet>

      <SearchDialog />
    </div>
  );
}
