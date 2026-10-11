"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchNote,
  fetchTree,
  uploadDocument,
  deleteDocument,
  fetchPreview,
  markRead,
  type PreviewPayload,
} from "@/lib/bcs-api";
import type { DocumentDTO } from "@/lib/bcs-types";
import { formatBytes, toBn } from "@/lib/bcs-types";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";
import { namePathOf } from "@/lib/bcs-tree-utils";
import { ReadBadge } from "@/components/bcs/shared/read-badge";
import { FavButton } from "@/components/bcs/shared/fav-button";
import { OcrDialog } from "./ocr-dialog";
import {
  CloudUpload,
  FileText,
  FileType2,
  FileCode2,
  FileType,
  FileImage,
  Eye,
  Download,
  Trash2,
  Loader2,
  HardDriveUpload,
  Maximize2,
  BookOpen,
  ScanText,
} from "lucide-react";

const MAX_SIZE = 512 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.html,.txt,.png,.jpg,.jpeg,.webp,.gif";
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

function openFullWindow(id: string) {
  window.open(`/api/documents/${id}/view`, "_blank", "noopener");
}

function iconFor(ext: string) {
  const e = ext.toLowerCase();
  switch (e) {
    case "pdf":
      return <FileText className="h-5 w-5 text-destructive/80" />;
    case "docx":
      return <FileType2 className="h-5 w-5 text-primary" />;
    case "html":
    case "htm":
      return <FileCode2 className="h-5 w-5 text-chart-2" />;
    default:
      if (IMAGE_EXTS.includes(e)) {
        return <FileImage className="h-5 w-5 text-violet-600 dark:text-violet-400" />;
      }
      return <FileType className="h-5 w-5 text-muted-foreground" />;
  }
}

const TYPE_GROUPS: { key: string; label: string; exts: string[] }[] = [
  { key: "pdf", label: "PDF", exts: ["pdf"] },
  { key: "docx", label: "ওয়ার্ড (DOCX)", exts: ["docx"] },
  { key: "img", label: "ছবি (Image)", exts: IMAGE_EXTS },
  { key: "html", label: "HTML", exts: ["html", "htm"] },
  { key: "txt", label: "টেক্সট (TXT)", exts: ["txt"] },
];

export function DocumentVault({ nodeId }: { nodeId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentDTO | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);

  const { data: nodes = [] } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
    staleTime: 60_000,
  });
  const nodePath = namePathOf(nodes, nodeId).join(" › ");

  const { data: note } = useQuery({
    queryKey: ["note", nodeId],
    queryFn: () => fetchNote(nodeId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["note", nodeId] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const doUpload = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      (async () => {
        for (const file of list) {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          if (!["pdf", "docx", "html", "txt", "htm", ...IMAGE_EXTS].includes(ext)) {
            toast.error(`"${file.name}" — শুধু PDF, DOCX, HTML, TXT ও ছবি (PNG/JPG/WEBP/GIF) সমর্থিত`);
            continue;
          }
          if (file.size > MAX_SIZE) {
            toast.error(`"${file.name}" — ৫১২MB সীমা ছাড়িয়ে গেছে`);
            continue;
          }
          try {
            setProgress(0);
            const name = ext === "htm" ? file.name.replace(/\.htm$/i, ".html") : file.name;
            await uploadDocument(nodeId, new File([file], name, { type: file.type }), (p) =>
              setProgress(p)
            );
            toast.success(`আপলোড হয়েছে: "${name}"`);
            invalidate();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "আপলোড ব্যর্থ হয়েছে");
          } finally {
            setProgress(null);
          }
        }
      })();
    },
    [nodeId]
  );

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      toast.success("ফাইলটি ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRead = useMutation({
    mutationFn: (id: string) => markRead("document", id),
    onSuccess: (d) => {
      toast.success(`পঠন সংখ্যা: ${toBn(d.readCount)} বার`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFullWindow = (id: string) => {
    window.open(`/api/documents/${id}/view`, "_blank", "noopener");
  };

  const docs = note?.documents ?? [];

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) doUpload(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="ফাইল আপলোড করুন"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          doUpload(e.dataTransfer.files);
        }}
        className={cn(
          "group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300",
          dragging
            ? "glow-ring border-primary bg-primary/8 scale-[1.01]"
            : "border-border/80 hover:border-primary/50 hover:bg-accent/40"
        )}
      >
        <span className="glass-strong flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110">
          <CloudUpload className="h-6 w-6 text-primary" />
        </span>
        <p className="text-sm font-semibold font-bengali">
          এখানে ফাইল ড্রপ করুন বা <span className="text-primary">ব্রাউজ করুন</span>
        </p>
        <p className="text-xs text-muted-foreground font-bengali">
          PDF · DOCX · HTML · TXT · ছবি (PNG, JPG, WEBP, GIF) — প্রতিটি সর্বোচ্চ <strong>৫১২MB</strong>, ভল্টে সংরক্ষিত হবে
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 font-bengali" onClick={() => setOcrOpen(true)}>
          <ScanText className="h-3.5 w-3.5" /> OCR — ছবি থেকে লেখা
        </Button>
      </div>

      {progress !== null && (
        <div className="glass flex items-center gap-3 rounded-xl p-3">
          <HardDriveUpload className="h-4 w-4 shrink-0 animate-pulse text-primary" />
          <Progress value={progress} className="h-2" />
          <span className="w-10 text-right text-xs font-semibold text-primary">
            {toBn(progress)}%
          </span>
        </div>
      )}

      {!note ? (
        <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">ফাইল লোড হচ্ছে…</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <p className="text-sm text-muted-foreground font-bengali">
            এখানে এখনো কোনো ফাইল নেই।
          </p>
          <p className="text-xs text-muted-foreground font-bengali">
            টিপ: বড় রেফারেন্স বইয়ের জন্য <strong>স্মার্ট লিংক</strong> (Drive/OneDrive) দিন — স্টোরেজ বাঁচবে।
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TYPE_GROUPS.map((group) => {
            const list = docs
              .filter((d) => group.exts.includes(d.ext.toLowerCase()))
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            if (list.length === 0) return null;
            return (
              <section key={group.key} className="glass flex flex-col rounded-2xl p-4">
                <header className="mb-3 flex items-center gap-2">
                  <span className="glass-strong flex h-8 w-8 items-center justify-center rounded-lg">
                    {iconFor(group.exts[0])}
                  </span>
                  <h3 className="truncate text-sm font-semibold font-bengali">{group.label}</h3>
                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                    {toBn(list.length)}
                  </Badge>
                </header>
                <ul className="flex flex-col gap-2">
                  {list.map((doc) => (
                    <li
                      key={doc.id}
                      className="glass rounded-xl p-3 transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_14px_var(--glow)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="glass-strong flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          {iconFor(doc.ext)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium" title={doc.name}>
                            {doc.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            <span className="uppercase">{doc.ext}</span> · {formatBytes(doc.size)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-1">
                        <ReadBadge count={doc.readCount ?? 0} compact />
                        <FavButton
                          kind="document"
                          targetId={doc.id}
                          title={doc.name}
                          path={nodePath}
                          meta={{ nodeId, ext: doc.ext }}
                          label="ফাইল"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 sm:h-7 sm:w-7"
                              onClick={() => doRead.mutate(doc.id)}
                              disabled={doRead.isPending && doRead.variables === doc.id}
                              aria-label="+১ পড়া হলো"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="font-bengali">+১ পড়া হলো</TooltipContent>
                        </Tooltip>
                        <div className="ml-auto flex items-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 sm:h-7 sm:w-7"
                                aria-label={`প্রিভিউ: ${doc.name}`}
                                onClick={() => setPreviewDoc(doc)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="font-bengali">প্রিভিউ দেখুন</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 sm:h-7 sm:w-7"
                                aria-label={`পুরো উইন্ডোতে খুলুন: ${doc.name}`}
                                onClick={() => openFullWindow(doc.id)}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="font-bengali">পুরো উইন্ডোতে খুলুন</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={`/api/documents/${doc.id}/file?download=1`}
                                download={doc.name}
                                aria-label={`ডাউনলোড: ${doc.name}`}
                                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary sm:h-7 sm:w-7"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent className="font-bengali">ডাউনলোড</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 text-muted-foreground hover:bg-destructive/15 hover:text-destructive sm:h-7 sm:w-7"
                                aria-label={`মুছুন: ${doc.name}`}
                                onClick={() => doDelete.mutate(doc.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="font-bengali">মুছে ফেলুন</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <DocPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <OcrDialog open={ocrOpen} onOpenChange={setOcrOpen} />
    </div>
  );
}

function DocPreviewDialog({ doc, onClose }: { doc: DocumentDTO | null; onClose: () => void }) {
  const enabled = !!doc;
  const { data, isLoading } = useQuery({
    queryKey: ["preview", doc?.id],
    queryFn: () => fetchPreview(doc!.id),
    enabled,
    staleTime: 5 * 60_000,
  });

  return (
    <Dialog open={enabled} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong flex h-[85vh] max-w-4xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 truncate text-base">
            {doc ? iconFor(doc.ext) : null}
            <span className="truncate">{doc?.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 font-bengali"
                    onClick={() => doc && openFullWindow(doc.id)}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">পুরো উইন্ডোতে খুলুন</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="font-bengali">পুরো উইন্ডোতে খুলুন</TooltipContent>
              </Tooltip>
              <a
                href={doc ? `/api/documents/${doc.id}/file?download=1` : "#"}
                download={doc?.name}
              >
                <Button size="sm" variant="outline" className="gap-1.5 font-bengali">
                  <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">ডাউনলোড</span>
                </Button>
              </a>
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">ডকুমেন্ট প্রিভিউ</DialogDescription>
        </DialogHeader>

        <div className="scroll-slim min-h-0 flex-1 overflow-auto rounded-xl bg-background/60">
          {isLoading || !data ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">প্রিভিউ তৈরি হচ্ছে…</span>
            </div>
          ) : (
            <PreviewBody payload={data} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ payload }: { payload: PreviewPayload }) {
  if (payload.kind === "pdf") {
    return (
      <iframe
        src={payload.fileUrl}
        title={payload.name}
        className="h-full min-h-[60vh] w-full rounded-xl"
      />
    );
  }
  if (payload.kind === "image") {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <img
          src={payload.fileUrl}
          alt={payload.name}
          className="max-h-[68vh] max-w-full rounded-lg bg-white object-contain shadow-sm"
        />
      </div>
    );
  }
  if (payload.kind === "html") {
    return (
      <iframe
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>
          body{font-family:'Kalpurush','Noto Sans Bengali','Times New Roman',serif;line-height:1.85;padding:24px;color:#1f2937;}
          table{border-collapse:collapse;margin:1em 0} td,th{border:1px solid #d1d5db;padding:6px 10px}
          img{max-width:100%} h1,h2,h3{margin:.8em 0 .4em} p{margin:.55em 0}
        </style></head><body>${payload.html}</body></html>`}
        title={payload.name}
        sandbox=""
        className="h-full min-h-[60vh] w-full rounded-xl bg-white"
      />
    );
  }
  if (payload.kind === "text") {
    return (
      <pre className="doc-preview-body whitespace-pre-wrap p-5 text-sm">{payload.text}</pre>
    );
  }
  return (
    <p className="p-6 text-sm text-muted-foreground font-bengali">
      এই ফাইল টাইপের প্রিভিউ পাওয়া যায় না — ডাউনলোড করে দেখুন।
    </p>
  );
}
