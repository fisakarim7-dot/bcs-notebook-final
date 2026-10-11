import type {
  AiGenerateResult,
  AiSettingsDTO,
  BackupStatus,
  CrossLinkGroup,
  CrossLinkKind,
  CrossLinkTarget,
  DocumentDTO,
  ExamCountdownDTO,
  FavoriteDTO,
  FlashcardDTO,
  LinkDTO,
  MasteryDTO,
  McqDTO,
  McqReviewDTO,
  MockTestConfig,
  NoteDTO,
  NoteItemDTO,
  PlanMonthDTO,
  QuestionAttachmentDTO,
  QuestionDTO,
  QuizAttemptDTO,
  ReadKind,
  SmartFeedback,
  SmartReviewItem,
  SmartReviewStats,
  SearchResult,
  StatsDTO,
  StudyNodeDTO,
  TreeNodeDTO,
  WrittenAttemptDTO,
  SyllabusItemDTO,
  CurrentAffairDTO,
  NoteVersionDTO,
  GraphNodeDTO,
  GraphEdgeDTO,
} from "./bcs-types";

// Re-export for shared UI components (e.g. fav-button optimistic cache typing)
export type { FavoriteDTO };

/**
 * Network-level failures (server off / restarting / laptop pack not started)
 * throw raw TypeError messages like "Failed to fetch" — translate them into a
 * clear, actionable Bangla message instead of surfacing cryptic English.
 */
export function friendlyNetworkError(err: unknown): Error {
  if (err instanceof TypeError) {
    const raw = err.message || "";
    if (
      /failed to fetch|networkerror|load failed|network request failed/i.test(raw)
    ) {
      return new Error(
        "সার্ভারে যোগাযোগ করা যাচ্ছে না — সার্ভার চালু আছে কি না দেখুন। " +
          "ল্যাপটপ প্যাকে START.bat আবার চালান (ইন্টারনেট লাগতে পারে); " +
          "তারপর পেজটি রিফ্রেশ করুন।"
      );
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw friendlyNetworkError(err);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchTree(): Promise<TreeNodeDTO[]> {
  const data = await req<{ nodes: TreeNodeDTO[] }>("/api/tree");
  return data.nodes;
}

// ---------- Independent study tree (ফ্ল্যাশকার্ড ও MCQ ব্যাংকের নিজস্ব লেভেল) ----------

export async function fetchStudyTree(): Promise<StudyNodeDTO[]> {
  const data = await req<{ nodes: StudyNodeDTO[] }>("/api/study-tree");
  return data.nodes;
}

export async function createStudyNode(input: {
  name: string;
  parentId: string | null;
}): Promise<StudyNodeDTO> {
  const data = await req<{ node: StudyNodeDTO }>("/api/study-tree", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.node;
}

export async function renameStudyNode(id: string, name: string): Promise<void> {
  await req(`/api/study-tree/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export async function deleteStudyNode(id: string): Promise<void> {
  await req(`/api/study-tree/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createNode(input: {
  name: string;
  type: "folder" | "note";
  parentId: string | null;
}): Promise<TreeNodeDTO> {
  const data = await req<{ node: TreeNodeDTO }>("/api/tree", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.node;
}

export async function renameNode(id: string, name: string): Promise<void> {
  await req(`/api/tree/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export async function setNodeCompleted(id: string, completed: boolean): Promise<void> {
  await req(`/api/tree/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ completed }),
  });
}

export async function deleteNode(id: string): Promise<void> {
  await req(`/api/tree/${id}`, { method: "DELETE" });
}

export async function fetchNote(nodeId: string): Promise<NoteDTO> {
  const data = await req<{ note: NoteDTO }>(`/api/notes/${nodeId}`);
  return data.note;
}

export async function saveNote(
  nodeId: string,
  patch: { content?: string; font?: "kalpurush" | "times"; completed?: boolean }
): Promise<{ savedAt: string }> {
  const data = await req<{ savedAt: string }>(`/api/notes/${nodeId}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return data;
}

export async function uploadDocument(
  noteId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<DocumentDTO> {
  // XHR for upload progress events (fetch cannot report upload progress)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/documents?noteId=${encodeURIComponent(noteId)}&name=${encodeURIComponent(
        file.name
      )}&mime=${encodeURIComponent(file.type)}`
    );
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { document?: DocumentDTO; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.document) resolve(body.document);
        else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(friendlyNetworkError(new TypeError("Failed to fetch")));
    xhr.send(file);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await req(`/api/documents/${id}`, { method: "DELETE" });
}

export type PreviewPayload =
  | { kind: "pdf"; name: string; fileUrl: string }
  | { kind: "image"; name: string; fileUrl: string }
  | { kind: "html"; name: string; html: string }
  | { kind: "text"; name: string; text: string }
  | { kind: "unsupported"; name: string };

export async function fetchPreview(id: string): Promise<PreviewPayload> {
  const data = await req<{ preview: PreviewPayload }>(`/api/documents/${id}/preview`);
  return data.preview;
}

export interface VaultDocItem {
  id: string;
  name: string;
  ext: string;
  size: number;
  createdAt: string;
  nodeId: string | null;
  nodePath: string | null;
}

/** Every file in the vault, with node path — for the AI "generate from file" browser. */
export async function fetchAllDocuments(): Promise<VaultDocItem[]> {
  const data = await req<{ documents: VaultDocItem[] }>("/api/documents");
  return data.documents;
}

export async function addLink(input: {
  noteId: string;
  title: string;
  url: string;
}): Promise<LinkDTO> {
  const data = await req<{ link: LinkDTO }>("/api/links", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.link;
}

/** Every smart link in the app with its node — for the calendar planner browser. */
export async function fetchAllLinks(): Promise<
  { id: string; title: string; url: string; provider: string; nodeId: string | null; createdAt: string }[]
> {
  const data = await req<{
    links: { id: string; title: string; url: string; provider: string; nodeId: string | null; createdAt: string }[];
  }>("/api/links");
  return data.links;
}

export async function deleteLink(id: string): Promise<void> {
  await req(`/api/links/${id}`, { method: "DELETE" });
}

export async function searchAll(q: string): Promise<SearchResult[]> {
  const data = await req<{ results: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(q)}`
  );
  return data.results;
}

export async function fetchStats(): Promise<StatsDTO> {
  return req<StatsDTO>("/api/stats");
}

export async function logSession(input: {
  mode: "focus" | "break" | "stopwatch";
  duration: number;
  nodeId?: string | null;
  nodePath?: string | null;
}): Promise<void> {
  await req("/api/sessions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

// ---------- NoteItems (multiple standalone notes per node) ----------

export async function fetchNoteItems(nodeId: string): Promise<NoteItemDTO[]> {
  const data = await req<{ items: NoteItemDTO[] }>(
    `/api/note-items?nodeId=${encodeURIComponent(nodeId)}`
  );
  return data.items;
}

export async function createNoteItem(input: {
  nodeId: string;
  title?: string;
  content?: string;
}): Promise<NoteItemDTO> {
  const data = await req<{ item: NoteItemDTO }>("/api/note-items", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.item;
}

export async function updateNoteItem(
  id: string,
  patch: { title?: string; content?: string; font?: string }
): Promise<{ item: NoteItemDTO; savedAt: string }> {
  const data = await req<{ item: NoteItemDTO; savedAt: string }>(
    `/api/note-items/${id}`,
    {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }
  );
  return data;
}

export async function deleteNoteItem(id: string): Promise<void> {
  await req(`/api/note-items/${id}`, { method: "DELETE" });
}

// ---------- Read tracking / mastery / backup ----------

export async function markRead(
  kind: ReadKind,
  id: string
): Promise<{ readCount: number; lastReadAt: string }> {
  const data = await req<{ ok: boolean; readCount: number; lastReadAt: string }>(
    "/api/reads",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ kind, id }),
    }
  );
  return { readCount: data.readCount, lastReadAt: data.lastReadAt };
}

export async function fetchBackupStatus(): Promise<BackupStatus> {
  return req<BackupStatus>("/api/backup/status");
}

export async function fetchMastery(target?: number): Promise<MasteryDTO> {
  const qs = target ? `?target=${target}` : "";
  return req<MasteryDTO>(`/api/mastery${qs}`);
}

export async function restoreBackup(file: File): Promise<{ ok: boolean; restoredFiles: number; restoredAt: string }> {
  const form = new FormData();
  form.append("file", file);
  const data = await req<{ ok: boolean; restoredFiles: number; restoredAt: string }>(
    "/api/restore",
    { method: "POST", body: form }
  );
  return data;
}

export async function backupNow(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/backup");
  } catch (err) {
    throw friendlyNetworkError(err);
  }
  if (!res.ok) {
    let message = `Backup failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="?([^";]+)"?/i.exec(disposition);
  a.href = url;
  a.download = m?.[1] ?? "BCS-Notebook-Backup.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- Study engine: flashcards / MCQ / attempts / AI ----------

export async function fetchFlashcards(mode?: "due"): Promise<{ cards: FlashcardDTO[]; count: number }> {
  const qs = mode === "due" ? "?mode=due" : "";
  return req<{ cards: FlashcardDTO[]; count: number }>(`/api/flashcards${qs}`);
}

export async function createFlashcard(input: {
  front: string;
  back: string;
  explanation?: string;
  explanationHtml?: string;
  nodeId?: string | null;
  nodePath?: string | null;
  studyNodeId?: string | null;
  studyNodePath?: string | null;
  source?: "manual" | "ai";
  cardType?: string;
  clozeText?: string;
  occlusionJson?: string;
}): Promise<FlashcardDTO> {
  const data = await req<{ card: FlashcardDTO }>("/api/flashcards", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.card;
}

export async function updateFlashcard(
  id: string,
  patch: {
    front?: string;
    back?: string;
    explanation?: string;
    explanationHtml?: string;
    favorite?: boolean;
    readLater?: boolean;
    suspended?: boolean;
    studyNodeId?: string | null;
    studyNodePath?: string | null;
    cardType?: string;
    clozeText?: string;
    occlusionJson?: string;
  }
): Promise<void> {
  await req(`/api/flashcards/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteFlashcard(id: string): Promise<void> {
  await req(`/api/flashcards/${id}`, { method: "DELETE" });
}

export async function reviewFlashcard(
  id: string,
  result: "correct" | "wrong"
): Promise<{ card: FlashcardDTO; nextDays: number }> {
  const data = await req<{ card: FlashcardDTO; nextDays: number }>(
    `/api/flashcards/${id}/review`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ result }),
    }
  );
  return data;
}

export async function fetchMcqs(
  mode?: "wrongbook"
): Promise<{ mcqs: McqDTO[]; count: number }> {
  const qs = mode === "wrongbook" ? "?mode=wrongbook" : "";
  return req<{ mcqs: McqDTO[]; count: number }>(`/api/mcqs${qs}`);
}

export async function createMcq(input: {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  explanationHtml?: string;
  nodeId?: string | null;
  nodePath?: string | null;
  studyNodeId?: string | null;
  studyNodePath?: string | null;
  source?: "manual" | "ai";
  tags?: string[]; // 🏷 #14
}): Promise<McqDTO> {
  const data = await req<{ mcq: McqDTO }>("/api/mcqs", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.mcq;
}

export async function updateMcq(
  id: string,
  patch: {
    question?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    explanationHtml?: string;
    favorite?: boolean;
    readLater?: boolean;
    suspended?: boolean;
    inWrongBook?: boolean;
    studyNodeId?: string | null;
    studyNodePath?: string | null;
    tags?: string[]; // 🏷 #14
  }
): Promise<void> {
  await req(`/api/mcqs/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteMcq(id: string): Promise<void> {
  await req(`/api/mcqs/${id}`, { method: "DELETE" });
}

export interface McqAttemptResultItem {
  id: string;
  chosen: number | null;
  correct: boolean;
  skipped?: boolean;
}

export async function submitMcqAttempt(input: {
  mode: "practice" | "wrongbook" | "mock";
  seconds: number;
  results: McqAttemptResultItem[];
  config?: MockTestConfig; // 🧪 #18 — mock test setup snapshot
}): Promise<QuizAttemptDTO> {
  const data = await req<{ ok: boolean; attempt: QuizAttemptDTO }>(
    "/api/mcqs/attempt",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }
  );
  return data.attempt;
}

export async function fetchAttempts(): Promise<QuizAttemptDTO[]> {
  const data = await req<{ attempts: QuizAttemptDTO[] }>("/api/attempts");
  return data.attempts;
}

// ---------- Smart Revision (#19) ----------
export async function fetchSmartReview(): Promise<{
  due: SmartReviewItem[];
  stats: SmartReviewStats;
}> {
  return req<{ due: SmartReviewItem[]; stats: SmartReviewStats }>(
    "/api/mcqs/smart-review"
  );
}

export async function postSmartFeedback(
  mcqId: string,
  feedback: SmartFeedback
): Promise<McqReviewDTO> {
  const data = await req<{ ok: boolean; review: McqReviewDTO }>(
    "/api/mcqs/smart-review",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ mcqId, feedback }),
    }
  );
  return data.review;
}

export async function fetchAiSettings(): Promise<AiSettingsDTO> {
  return req<AiSettingsDTO>("/api/settings");
}

export async function saveAiSettings(input: {
  apiKey?: string;
  apiBase?: string;
  model?: string;
  studyPrefs?: { srs?: string; interleave?: boolean; tts?: boolean };
}): Promise<AiSettingsDTO> {
  return req<AiSettingsDTO>("/api/settings", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export async function testAi(): Promise<{ ok: boolean; provider: string; model: string; reply?: string }> {
  return req("/api/ai/test", { method: "POST" });
}

export async function aiGenerate(input: {
  kind: "flashcards" | "mcqs";
  nodeId?: string | null;
  documentId?: string | null;
  text?: string | null;
  count: number;
}): Promise<AiGenerateResult> {
  return req<AiGenerateResult>("/api/ai/generate", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

// ---------- Question bank (প্রশ্নব্যাংক) ----------

export async function fetchQuestions(nodeId?: string): Promise<QuestionDTO[]> {
  const qs = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : "";
  const data = await req<{ questions: QuestionDTO[] }>(`/api/questions${qs}`);
  return data.questions;
}

export async function createQuestion(input: {
  nodeId?: string | null;
  title?: string;
  contentHtml: string;
}): Promise<QuestionDTO> {
  const data = await req<{ question: QuestionDTO }>("/api/questions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.question;
}

export async function updateQuestion(
  id: string,
  patch: {
    title?: string;
    contentHtml?: string;
    favorite?: boolean;
    noteHtml?: string;
  }
): Promise<void> {
  await req(`/api/questions/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteQuestion(id: string): Promise<void> {
  await req(`/api/questions/${id}`, { method: "DELETE" });
}

// ---------- Question attachments (উত্তর-সোর্স: ফাইল / ছবি / লিংক) ----------

/** Upload one file/image as an answer-source of a question (XHR for progress). */
export async function uploadQuestionAttachment(
  questionId: string,
  file: File,
  opts?: { name?: string; onProgress?: (pct: number) => void }
): Promise<QuestionAttachmentDTO> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/questions/${encodeURIComponent(questionId)}/attachments?name=${encodeURIComponent(
        opts?.name ?? file.name
      )}&mime=${encodeURIComponent(file.type || "application/octet-stream")}`
    );
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts?.onProgress)
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as {
          attachment?: QuestionAttachmentDTO;
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && body.attachment) resolve(body.attachment);
        else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(friendlyNetworkError(new TypeError("Failed to fetch")));
    xhr.send(file);
  });
}

/** Attach a cloud link (Drive / OneDrive / Dropbox / web) to a question. */
export async function addQuestionLink(
  questionId: string,
  input: { name?: string; url: string }
): Promise<QuestionAttachmentDTO> {
  const data = await req<{ attachment: QuestionAttachmentDTO }>(
    `/api/questions/${encodeURIComponent(questionId)}/attachments`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }
  );
  return data.attachment;
}

/** Create a rich-text answer-source (নোট / তথ্য-উপাত্ত) on a question. */
export async function addQuestionRichSource(
  questionId: string,
  input: { kind: "note" | "data"; name?: string; contentHtml?: string }
): Promise<QuestionAttachmentDTO> {
  const data = await req<{ attachment: QuestionAttachmentDTO }>(
    `/api/questions/${encodeURIComponent(questionId)}/attachments`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }
  );
  return data.attachment;
}

/** Autosave a rich-text answer-source (title / body / font). */
export async function updateQuestionRichSource(
  id: string,
  patch: { name?: string; contentHtml?: string; font?: string }
): Promise<void> {
  await req(`/api/question-attachments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteQuestionAttachment(id: string): Promise<void> {
  await req(`/api/question-attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------- Universal favorites (💜) ----------

export async function fetchFavorites(): Promise<FavoriteDTO[]> {
  const data = await req<{ favorites: FavoriteDTO[] }>("/api/favorites");
  return data.favorites;
}

/** Toggle a 💜 — returns the new state. */
export async function toggleFavorite(input: {
  kind: string;
  targetId: string;
  title?: string;
  path?: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const data = await req<{ favorited: boolean }>("/api/favorites", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.favorited;
}

// ---------- Study-plan calendar ----------

export async function fetchPlanMonth(month: string): Promise<PlanMonthDTO> {
  return req<PlanMonthDTO>(`/api/plan?month=${encodeURIComponent(month)}`);
}

export async function addPlanItem(input: {
  date: string;
  kind: string;
  targetId?: string | null;
  title: string;
  path?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await req("/api/plan", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export async function updatePlanItem(
  id: string,
  patch: { done?: boolean; date?: string }
): Promise<void> {
  await req(`/api/plan/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deletePlanItem(id: string): Promise<void> {
  await req(`/api/plan/${id}`, { method: "DELETE" });
}

export async function setDayStatus(
  date: string,
  status: "success" | "fail" | null
): Promise<void> {
  await req("/api/plan/day", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ date, status }),
  });
}

// ---------- Exam countdown (পরীক্ষার কাউন্টডাউন — সর্বোচ্চ ৩টি) ----------

export async function fetchExams(): Promise<ExamCountdownDTO[]> {
  const data = await req<{ exams: ExamCountdownDTO[] }>("/api/exams");
  return data.exams ?? [];
}

export async function addExam(input: {
  title: string;
  date: string;
  note?: string;
}): Promise<void> {
  await req("/api/exams", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export async function updateExam(
  id: string,
  patch: { title?: string; date?: string; note?: string }
): Promise<void> {
  await req(`/api/exams/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

export async function deleteExam(id: string): Promise<void> {
  await req(`/api/exams/${id}`, { method: "DELETE" });
}

// ---------- Cross Linking (#33: সব কনটেন্ট পরস্পর সংযুক্ত) ----------

/** Every manual link touching (kind,id), resolved to the other end. */
export async function fetchCrossLinks(
  kind: CrossLinkKind,
  id: string
): Promise<CrossLinkTarget[]> {
  const data = await req<{ links: CrossLinkTarget[] }>(
    `/api/cross-links?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`
  );
  return data.links;
}

/** Keyword-based auto-match suggestions, grouped per target kind. */
export async function suggestCrossLinks(
  kind: CrossLinkKind,
  id: string
): Promise<{ groups: CrossLinkGroup[] }> {
  const data = await req<{ groups: CrossLinkGroup[] }>(
    `/api/cross-links/suggest?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`
  );
  return { groups: data.groups };
}

/** Forge a connection (bidirectional — direction-normalized server-side). */
export async function addCrossLink(input: {
  sourceKind: CrossLinkKind;
  sourceId: string;
  targetKind: CrossLinkKind;
  targetId: string;
}): Promise<void> {
  await req("/api/cross-links", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

/** Remove one connection row. */
export async function deleteCrossLink(linkId: string): Promise<void> {
  await req(`/api/cross-links?id=${encodeURIComponent(linkId)}`, { method: "DELETE" });
}

// ================= Safe Delete — ট্র্যাশ (#21) =================

/** One trashed item (snapshot lives server-side; this is the display row). */
export interface TrashItemDTO {
  id: string;
  kind: "node" | "noteItem" | "document" | "link" | "question" | "questionAttachment" | "flashcard" | "mcq";
  refId: string;
  title: string;
  path: string;
  summary: string;
  sizeBytes: number;
  deletedAt: string;
}

export interface TrashListDTO {
  items: TrashItemDTO[];
  count: number;
  byKind: Record<string, number>;
  totalBytes: number;
  autoPurgeDays: number;
  purgedNow: number;
}

export async function fetchTrash(): Promise<TrashListDTO> {
  return req<TrashListDTO>("/api/trash");
}

export async function restoreTrashItem(id: string): Promise<{ message: string }> {
  const data = await req<{ ok: boolean; message: string }>(`/api/trash/${encodeURIComponent(id)}`, {
    method: "POST",
  });
  return { message: data.message };
}

export async function permanentDeleteTrashItem(id: string): Promise<void> {
  await req(`/api/trash/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function emptyTrash(): Promise<{ removed: number }> {
  const data = await req<{ ok: boolean; removed: number }>("/api/trash", { method: "DELETE" });
  return { removed: data.removed };
}

export async function setTrashAutoPurge(days: number): Promise<void> {
  await req("/api/trash", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ autoPurgeDays: days }),
  });
}

// ================= Notifications (#29) =================

export interface NotifSettingsDTO {
  enabled: boolean;
  dueRevision: { on: boolean; mcqDays: number };
  weeklyProgress: { on: boolean };
  staleSubject: { on: boolean; days: number };
  examSoon: { on: boolean; withinDays: number };
  backup: { on: boolean; days: number };
  trash: { on: boolean };
}

export interface NotificationItemDTO {
  id: string;
  type: "due-revision" | "weekly-progress" | "stale-subject" | "exam-soon" | "backup-due" | "trash-pending";
  level: "info" | "success" | "warning";
  icon: string;
  title: string;
  count: number;
  action?: {
    kind: "view" | "dialog";
    view?: "study" | "calendar" | "dashboard" | "favorites";
    nodeId?: string;
    dialog?: "backup" | "trash";
  };
}

export interface NotificationsDTO {
  items: NotificationItemDTO[];
  unreadCount: number;
  settings: NotifSettingsDTO;
  generatedAt: string;
}

export async function fetchNotifications(): Promise<NotificationsDTO> {
  return req<NotificationsDTO>("/api/notifications");
}

export async function saveNotificationSettings(settings: NotifSettingsDTO): Promise<NotificationsDTO> {
  return req<NotificationsDTO>("/api/notifications", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ settings }),
  });
}

export async function markNotificationsRead(fingerprints: string[]): Promise<void> {
  await req("/api/notifications/read", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ fingerprints }),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await req("/api/notifications/read", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ all: true }),
  });
}

// ================= Additive modules =================

export async function reorderTree(items: { id: string; order: number }[]): Promise<void> {
  await req("/api/tree/reorder", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ items }),
  });
}

export async function reviewFsrs(
  id: string,
  rating: "again" | "hard" | "good" | "easy"
): Promise<{ nextDays: number }> {
  return req(`/api/fsrs/review`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ id, rating }),
  });
}

export async function fetchWritten(): Promise<WrittenAttemptDTO[]> {
  const data = await req<{ attempts: WrittenAttemptDTO[] }>("/api/written");
  return data.attempts;
}
export async function createWritten(input: {
  title?: string;
  kind?: string;
  promptHtml?: string;
  marks?: number;
  minutes?: number;
  questionId?: string | null;
}): Promise<WrittenAttemptDTO> {
  const data = await req<{ attempt: WrittenAttemptDTO }>("/api/written", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.attempt;
}
export async function updateWritten(
  id: string,
  patch: { title?: string; promptHtml?: string; answerHtml?: string; secondsUsed?: number; status?: string }
): Promise<WrittenAttemptDTO> {
  const data = await req<{ attempt: WrittenAttemptDTO }>(`/api/written/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  return data.attempt;
}
export async function deleteWritten(id: string): Promise<void> {
  await req(`/api/written/${id}`, { method: "DELETE" });
}
export async function evaluateWritten(id: string): Promise<{ attempt: WrittenAttemptDTO; feedback: unknown }> {
  return req(`/api/written/${id}/evaluate`, { method: "POST" });
}

export async function fetchSyllabus(): Promise<SyllabusItemDTO[]> {
  const data = await req<{ items: SyllabusItemDTO[] }>("/api/syllabus");
  return data.items;
}
export async function updateSyllabus(
  id: string,
  patch: { status?: string; strength?: string; notes?: string; nodeId?: string | null }
): Promise<void> {
  await req(`/api/syllabus/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
}

/** ট্রি-চেকলিস্ট: any tree node (level 1–6) — status upsert keyed by nodeId. */
export async function setSyllabusNodeStatus(
  nodeId: string,
  status: string,
  meta: { subject: string; topic: string }
): Promise<SyllabusItemDTO> {
  const data = await req<{ item: SyllabusItemDTO }>("/api/syllabus", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ nodeId, status, subject: meta.subject, topic: meta.topic }),
  });
  return data.item;
}

/** ট্রি-চেকলিস্ট: per-node preparation strength (5-level dropdown, "" clears it). */
export async function setSyllabusNodeStrength(
  nodeId: string,
  strength: string,
  meta: { subject: string; topic: string }
): Promise<SyllabusItemDTO> {
  const data = await req<{ item: SyllabusItemDTO }>("/api/syllabus", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ nodeId, strength, subject: meta.subject, topic: meta.topic }),
  });
  return data.item;
}

export async function fetchAffairs(month?: string): Promise<CurrentAffairDTO[]> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  const data = await req<{ items: CurrentAffairDTO[] }>(`/api/affairs${qs}`);
  return data.items;
}
export async function createAffair(input: {
  date?: string;
  title: string;
  summary?: string;
  category?: string;
  factLines?: string[];
  mcqQuestion?: string;
  mcqOptions?: string[];
  mcqCorrect?: number;
}): Promise<CurrentAffairDTO> {
  const data = await req<{ item: CurrentAffairDTO }>("/api/affairs", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return data.item;
}
export async function generateAffair(text: string, date?: string): Promise<CurrentAffairDTO> {
  const data = await req<{ item: CurrentAffairDTO }>("/api/affairs/generate", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ text, date }),
  });
  return data.item;
}
export async function deleteAffair(id: string): Promise<void> {
  await req(`/api/affairs/${id}`, { method: "DELETE" });
}

export async function askTutor(
  messages: { role: string; content: string }[],
  nodeId?: string | null
): Promise<{ reply: string }> {
  return req("/api/tutor", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ messages, nodeId }),
  });
}

export async function ocrImage(image: string, hint?: string): Promise<{ text: string }> {
  return req("/api/ocr", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ image, hint }),
  });
}

export async function importMcqs(
  items: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
    tags?: string[];
  }[],
  tag?: string
): Promise<{ created: number; skipped: number }> {
  return req("/api/mcqs/import", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ items, tag }),
  });
}

export async function fetchGraph(): Promise<{
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  totalNodes: number;
  totalEdges: number;
}> {
  return req("/api/graph");
}

export async function fetchNoteVersions(noteItemId: string): Promise<NoteVersionDTO[]> {
  const data = await req<{ versions: NoteVersionDTO[] }>(
    `/api/note-versions/${encodeURIComponent(noteItemId)}`
  );
  return data.versions;
}
export async function restoreNoteVersion(noteItemId: string, restoreId: string): Promise<{ title: string; content: string }> {
  return req(`/api/note-versions/${encodeURIComponent(noteItemId)}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ restoreId }),
  });
}

