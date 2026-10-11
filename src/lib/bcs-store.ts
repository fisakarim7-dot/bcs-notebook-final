import { create } from "zustand";

export type MainView =
  | "dashboard"
  | "node"
  | "study"
  | "calendar"
  | "favorites"
  | "today"
  | "written"
  | "analytics"
  | "syllabus"
  | "affairs"
  | "graph"
  | "tutor";

/** Workspace tab to auto-open when a node is selected (deep-link from favorites/calendar). */
export type WorkspaceTab = "notes" | "docs" | "links" | "questions";

interface BcsStore {
  selectedId: string | null;
  view: MainView;
  expanded: Record<string, boolean>;
  searchOpen: boolean;
  sidebarOpenMobile: boolean;
  nodeTab: WorkspaceTab | null;
  nodeTabSeq: number;
  /** Safe Delete (#21) trash dialog — global so toasts/bell can open it. */
  trashOpen: boolean;
  setTrashOpen: (open: boolean) => void;
  /** Backup dialog — global so the notification bell can open it. */
  backupOpen: boolean;
  setBackupOpen: (open: boolean) => void;
  selectNode: (id: string | null, expandAncestors?: string[]) => void;
  /** Select a node AND force-open one of its workspace tabs (প্রিয়/ক্যালেন্ডার deep-link). */
  openNodeTab: (id: string, tab: WorkspaceTab, expandAncestors?: string[]) => void;
  /** Switch to the tree workspace view without changing the selected node. */
  goNode: () => void;
  goDashboard: () => void;
  goStudy: () => void;
  goCalendar: () => void;
  goFavorites: () => void;
  goToday: () => void;
  goWritten: () => void;
  goAnalytics: () => void;
  goSyllabus: () => void;
  goAffairs: () => void;
  goGraph: () => void;
  goTutor: () => void;
  /** Jump for notification actions — switches view, optionally selects a node. */
  goNotifView: (view: MainView, nodeId?: string | null) => void;
  toggleExpanded: (id: string) => void;
  expandMany: (ids: string[]) => void;
  setSearchOpen: (open: boolean) => void;
  setSidebarOpenMobile: (open: boolean) => void;
}

export const useBcsStore = create<BcsStore>((set) => ({
  selectedId: null,
  view: "dashboard",
  expanded: {},
  searchOpen: false,
  sidebarOpenMobile: false,
  nodeTab: null,
  nodeTabSeq: 0,
  trashOpen: false,
  setTrashOpen: (open) => set({ trashOpen: open }),
  backupOpen: false,
  setBackupOpen: (open) => set({ backupOpen: open }),
  selectNode: (id, expandAncestors) =>
    set((s) => ({
      selectedId: id,
      view: id ? "node" : s.view,
      nodeTab: null, // plain navigation always opens the default (নোট) tab
      expanded: expandAncestors
        ? { ...s.expanded, ...Object.fromEntries(expandAncestors.map((k) => [k, true])) }
        : s.expanded,
      sidebarOpenMobile: false,
    })),
  openNodeTab: (id, tab, expandAncestors) =>
    set((s) => ({
      selectedId: id,
      view: "node",
      nodeTab: tab,
      nodeTabSeq: s.nodeTabSeq + 1, // bump forces a fresh workspace mount even for the same node
      expanded: expandAncestors
        ? { ...s.expanded, ...Object.fromEntries(expandAncestors.map((k) => [k, true])) }
        : s.expanded,
      sidebarOpenMobile: false,
    })),
  goNode: () => set({ view: "node", sidebarOpenMobile: false }),
  goDashboard: () => set({ view: "dashboard", sidebarOpenMobile: false }),
  goStudy: () => set({ view: "study", sidebarOpenMobile: false }),
  goCalendar: () => set({ view: "calendar", sidebarOpenMobile: false }),
  goFavorites: () => set({ view: "favorites", sidebarOpenMobile: false }),
  goToday: () => set({ view: "today", sidebarOpenMobile: false }),
  goWritten: () => set({ view: "written", sidebarOpenMobile: false }),
  goAnalytics: () => set({ view: "analytics", sidebarOpenMobile: false }),
  goSyllabus: () => set({ view: "syllabus", sidebarOpenMobile: false }),
  goAffairs: () => set({ view: "affairs", sidebarOpenMobile: false }),
  goGraph: () => set({ view: "graph", sidebarOpenMobile: false }),
  goTutor: () => set({ view: "tutor", sidebarOpenMobile: false }),
  toggleExpanded: (id) =>
    set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  expandMany: (ids) =>
    set((s) => ({
      expanded: { ...s.expanded, ...Object.fromEntries(ids.map((k) => [k, true])) },
    })),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSidebarOpenMobile: (open) => set({ sidebarOpenMobile: open }),
  /** Notification-action navigation: switch view + optional node select. */
  goNotifView: (view, nodeId) =>
    set((s) => ({
      view,
      selectedId: nodeId ?? s.selectedId,
      sidebarOpenMobile: false,
    })),
}));
