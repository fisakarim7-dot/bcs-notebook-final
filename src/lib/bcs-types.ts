export type NodeType = "folder" | "note";

// Independent study-level tree (ফ্ল্যাশকার্ড ও MCQ ব্যাংকের নিজস্ব লেভেল) —
// SEPARATE from the dashboard TreeNode system.
export interface StudyNodeDTO {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreeNodeDTO {
  id: string;
  name: string;
  type: NodeType;
  order: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  noteCompleted?: boolean;
  noteUpdatedAt?: string | null;
}

export interface DocumentDTO {
  id: string;
  name: string;
  ext: string;
  mime: string;
  size: number;
  createdAt: string;
  readCount?: number;
  lastReadAt?: string | null;
}

export interface LinkDTO {
  id: string;
  title: string;
  url: string;
  provider: string;
  createdAt: string;
  readCount?: number;
  lastReadAt?: string | null;
}

export interface NoteItemDTO {
  id: string;
  title: string;
  content: string;
  font: string;
  nodeId: string;
  readCount: number;
  lastReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReadKind = "note" | "noteItem" | "document" | "link";

export interface BackupStatus {
  lastBackupAt: string | null;
  daysSince: number | null;
}

export interface NoteDTO {
  id: string;
  nodeId: string;
  content: string;
  font: "kalpurush" | "times";
  completed: boolean;
  documents: DocumentDTO[];
  links: LinkDTO[];
  updatedAt: string;
}

export interface SubjectStat {
  id: string;
  name: string;
  totalNotes: number;
  completedNotes: number;
  percent: number;
  notes: number;
  documents: number;
  links: number;
  noteItems: number;
  totalItems: number;
}

export interface StatsDTO {
  totals: {
    subjects: number;
    folders: number;
    notes: number;
    completedNotes: number;
    documents: number;
    links: number;
    storageBytes: number;
    focusMinutes: number;
    todayFocusMinutes: number;
  };
  subjects: SubjectStat[];
  recent: {
    id: string;
    name: string;
    completed: boolean;
    updatedAt: string;
  }[];
  weekFocus: { date: string; minutes: number }[];
}

/** Workspace tab a search result should deep-open (mirrors bcs-store WorkspaceTab). */
export type SearchResultTab = "notes" | "docs" | "links" | "questions";

export interface SearchResult {
  kind:
    | "node"
    | "content"
    | "noteItem"
    | "document"
    | "link"
    | "question"
    | "mcq"
    | "flashcard"
    | "plan"
    | "favorite";
  nodeId: string;
  path: string; // breadcrumb "Subject / Part / Topic"
  title?: string; // display title for noteItem/document/link/question results
  name?: string; // node display name (node/content kinds)
  snippet?: string;
  completed?: boolean;
  /** workspace tab to force-open when navigating (kinds living inside a node) */
  tab?: SearchResultTab;
  /** the item's own id (noteItem/document/link/question/…) — node/content use nodeId */
  targetId?: string;
}

// ---------- Cross Linking (#33): সব কনটেন্ট পরস্পর সংযুক্ত ----------

/** Linkable content kinds (topic / note / file / cloud-link / written question). */
export type CrossLinkKind = "node" | "noteItem" | "document" | "link" | "question";

/** One resolved end of a cross-link (dangling links never reach the client). */
export interface CrossLinkTarget {
  kind: CrossLinkKind | string;
  id: string;
  title: string;
  path: string; // breadcrumb "Subject / Part / …"
  /** node to deep-open when clicked (workspace tab is chosen from kind) */
  nodeId: string | null;
  /** cross-link row id (GET /api/cross-links only) — needed to unpin */
  linkId?: string;
  ext?: string; // document file extension
  url?: string; // link target url
  provider?: string; // link provider
  score?: number; // auto-match relevance (suggest endpoint only)
}

export interface CrossLinkGroup {
  kind: CrossLinkKind | string;
  items: CrossLinkTarget[];
}

export interface MasteryItem {
  id: string;
  kind: "noteItem" | "document" | "link";
  title: string;
  path: string; // "Subject › Part › ... › Node"
  readCount: number;
  lastReadAt: string | null;
}

export interface MasterySubject {
  id: string;
  name: string;
  totalItems: number;
  byKind: { note: number; document: number; link: number };
  totalReads: number;
  masteredItems: number;
  distribution: number[]; // length 6: [0,1,2,3,4,5+] read buckets
  masteryPct: number;
  items: MasteryItem[]; // sorted readCount asc
}

export interface MasteryDTO {
  target: number;
  overall: {
    totalItems: number;
    totalReads: number;
    masteredItems: number;
    masteryPct: number;
  };
  subjects: MasterySubject[];
}

// ---------- Study engine: flashcards / MCQ / attempts / AI settings ----------

export interface FlashcardDTO {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  front: string;
  back: string;
  explanation: string; // legacy plain-text
  explanationHtml: string; // rich-text explanation (Tiptap) — takes precedence
  favorite: boolean; // 💜
  readLater: boolean; // 🔖 পরবর্তীতে পড়ুন
  box: number; // Leitner 1..5
  dueDate: string;
  lastResult: "correct" | "wrong" | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  wrongCount: number;
  suspended: boolean;
  source: "manual" | "ai" | string;
  cardType: "basic" | "cloze" | "occlusion" | string;
  clozeText: string;
  occlusionJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface McqDTO {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string; // legacy plain-text
  explanationHtml: string; // rich-text explanation (Tiptap) — takes precedence
  favorite: boolean; // 💜
  readLater: boolean; // 🔖 পরবর্তীতে পড়ুন
  attempts: number;
  correctCount: number;
  wrongCount: number;
  lastResult: "correct" | "wrong" | "skipped" | null;
  lastAttemptAt: string | null;
  inWrongBook: boolean;
  suspended: boolean;
  source: "manual" | "ai" | string;
  tags: string[]; // 🏷 Tag System (#14)
  createdAt: string;
  updatedAt: string;
}

// ---------- Smart Revision (#19) ----------
export interface McqReviewDTO {
  mcqId: string;
  lastReviewedAt: string | null;
  nextReviewAt: string;
  reviewCount: number;
  confidence: number; // 0..100
  level: number; // 0..6
  lapses: number;
}

export interface SmartReviewItem {
  mcq: McqDTO;
  review: McqReviewDTO | null; // null = first time (untracked)
}

export interface SmartReviewStats {
  due: number;
  tracked: number;
  untracked: number;
  avgConfidence: number;
  reviewedToday: number;
  total: number;
  nextDueAt: string | null;
}

export type SmartFeedback = "again" | "hard" | "good" | "easy";

// ---------- Mock Test Engine (#18) ----------
export interface MockTestConfig {
  subject?: string; // display name of the chosen subject (study tree root)
  topic?: string; // display name of the chosen topic (descendant)
  difficulty?: "all" | "easy" | "medium" | "hard" | "new" | string;
  previousOnly?: boolean; // only questions attempted before
  random?: boolean; // shuffled question order
}

export interface QuizAttemptDTO {
  id: string;
  mode: "practice" | "wrongbook" | "mock" | string;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  seconds: number;
  config: MockTestConfig; // Mock Test Engine (#18) snapshot
  createdAt: string;
}

export interface AiSettingsDTO {
  hasKey: boolean;
  keyMasked: string;
  apiBase: string;
  model: string;
  defaults: { apiBase: string; model: string };
  studyPrefs: { srs: "leitner" | "fsrs"; interleave: boolean; tts: boolean };
}

export interface WrittenAttemptDTO {
  id: string;
  questionId: string | null;
  title: string;
  kind: "essay" | "precis" | "translation" | "report" | "custom" | string;
  promptHtml: string;
  answerHtml: string;
  marks: number;
  minutes: number;
  secondsUsed: number;
  aiFeedback: string;
  status: "draft" | "submitted" | "evaluated" | string;
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusItemDTO {
  id: string;
  paper: "prelim" | "written" | string;
  subject: string;
  topic: string;
  marks: number;
  order: number;
  nodeId: string | null;
  status: "unread" | "reading" | "noted" | "mcq" | "weak" | "mastered" | string;
  strength: "very_weak" | "weak" | "medium" | "strong" | "very_strong" | "" | string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentAffairDTO {
  id: string;
  date: string;
  title: string;
  summary: string;
  category: string;
  factLines: string[];
  mcqQuestion: string;
  mcqOptions: string[];
  mcqCorrect: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteVersionDTO {
  id: string;
  noteItemId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface GraphNodeDTO {
  id: string;
  kind: string;
  title: string;
  path: string;
}
export interface GraphEdgeDTO {
  id: string;
  source: string;
  target: string;
}


export type AiDraftCard = { front: string; back: string };
export type AiDraftMcq = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};
export interface AiGenerateResult {
  kind: "flashcards" | "mcqs";
  items: AiDraftCard[] | AiDraftMcq[];
  provider: "byok" | "builtin" | string;
  model: string;
}

// ---------- Question bank (প্রশ্নব্যাংক) ----------

export interface QuestionDTO {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  title: string;
  contentHtml: string;
  contentPlain: string;
  favorite: boolean;
  noteHtml: string;
  notePlain: string;
  attachments: QuestionAttachmentDTO[];
  createdAt: string;
  updatedAt: string;
}

/** One answer-source of a question: uploaded file / image / cloud link. */
export interface QuestionAttachmentDTO {
  id: string;
  questionId: string;
  kind: "file" | "image" | "link" | "note" | "data";
  name: string;
  ext: string;
  mime: string;
  size: number;
  path: string;
  url: string;
  provider: string;
  /** kind="note" | "data" — rich-text body + font */
  contentHtml?: string;
  font?: string;
  createdAt: string;
}

// ---------- Universal favorites (💜) ----------

export type FavKind = "noteItem" | "document" | "link" | "question" | "node";

export interface FavoriteDTO {
  id: string;
  kind: FavKind | string;
  targetId: string;
  title: string;
  path: string;
  meta: string; // JSON string: {nodeId?, ext?, url?}
  createdAt: string;
  updatedAt: string;
}

// ---------- Study-plan calendar ----------

export type PlanKind = "node" | "noteItem" | "document" | "link" | "question" | "custom";

export interface PlanItemDTO {
  id: string;
  date: string; // YYYY-MM-DD
  kind: PlanKind | string;
  targetId: string | null;
  title: string;
  path: string;
  meta: string; // JSON string
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanWeekStat {
  start: string;
  success: number;
  fail: number;
}

/** রোলিং ৮ সপ্তাহ — প্রতিটি বার আজ দিয়ে শেষ হওয়া ৭ দিনের বাকেট */
export interface PlanRollingWeekStat {
  start: string;
  end: string;
  success: number;
  fail: number;
}

export interface PlanStatsDTO {
  today: string;
  currentStreak: number;
  bestStreak: number;
  weeks: PlanWeekStat[];
  rollingWeeks: PlanRollingWeekStat[];
  heatmap: { date: string; status: string | null }[];
  successDays: number;
  failDays: number;
  markedDays: number;
  successRate: number;
  thisWeekSuccess: number;
  totalItems: number;
  doneItems: number;
}

export interface PlanMonthDTO {
  month: string;
  items: PlanItemDTO[];
  statusMap: Record<string, string>;
  stats: PlanStatsDTO;
}

/** পরীক্ষার কাউন্টডাউন (সর্বোচ্চ ৩টি — server-enforced) */
export interface ExamCountdownDTO {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** Convert ASCII digits (0-9) in a number/string to Bengali digits (০-৯). */
export function toBn(n: number | string): string {
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => bnDigits[Number(d)]);
}

export const LEVEL_NAMES = [
  "Subject",
  "Part",
  "Topic",
  "Sub-topic",
  "Section",
  "Leaf Note",
] as const;

export const MAX_LEVEL = 6;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
