"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { backupNow, restoreBackup, fetchBackupStatus } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import {
  DatabaseBackup,
  Download,
  FileDown,
  FileUp,
  FolderUp,
  Loader2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

const backupDateFmt = new Intl.DateTimeFormat("bn-BD", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function statusInfo(days: number | null, lastBackupAt: string | null) {
  if (days == null) {
    return {
      dot: "bg-red-500 animate-pulse",
      cls: "text-red-500",
      text: "এখনো ব্যাকআপ নেওয়া হয়নি — এখনই একটি ব্যাকআপ নিন",
    };
  }
  const when = lastBackupAt
    ? ` (সর্বশেষ: ${backupDateFmt.format(new Date(lastBackupAt))})`
    : "";
  if (days <= 3) {
    return {
      dot: "bg-emerald-500",
      cls: "text-emerald-600 dark:text-emerald-400",
      text: `শেষ ব্যাকআপ: ${toBn(days)} দিন আগে — সব ঠিক আছে${when}`,
    };
  }
  if (days <= 6) {
    return {
      dot: "bg-amber-500",
      cls: "text-amber-600 dark:text-amber-400",
      text: `শেষ ব্যাকআপ: ${toBn(days)} দিন আগে — নতুন ব্যাকআপ নেওয়া ভালো${when}`,
    };
  }
  return {
    dot: "bg-red-500 animate-pulse",
    cls: "text-red-500",
    text: `শেষ ব্যাকআপ: ${toBn(days)} দিন আগে — দীর্ঘদিন ব্যাকআপ হয়নি!${when}`,
  };
}

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["backup-status"],
    queryFn: fetchBackupStatus,
    enabled: open,
    staleTime: 60_000,
  });

  // Storage mode — local ZIP backup only exists on-disk; in the cloud we show the
  // provider-agnostic transfer (export/import) instead.
  const { data: mode } = useQuery({
    queryKey: ["exim-mode"],
    queryFn: () => fetch("/api/exim/mode").then((r) => r.json()),
    enabled: open,
    staleTime: Infinity,
  });
  const cloudMode = mode?.cloud === true;

  const eximFileRef = useRef<HTMLInputElement>(null);
  const [eximFile, setEximFile] = useState<File | null>(null);
  const [eximConfirm, setEximConfirm] = useState(false);

  const doImport = useMutation({
    mutationFn: async () => {
      let res: Response;
      const isJson = /\.json$/i.test(eximFile!.name);
      if (isJson) {
        // Data-only JSON: small, no Blob/chunks — the most reliable path.
        res = await fetch("/api/exim/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: eximFile!,
        });
      } else if (cloudMode) {
        // Cloud: Vercel serverless caps a single request body (~4.5MB), so send
        // the ZIP in small chunks to /api/exim/upload-part, then import by id.
        const CHUNK = 3.5 * 1024 * 1024;
        const uploadId =
          (globalThis.crypto?.randomUUID?.() ?? String(Date.now())) .replace(/[^a-zA-Z0-9-]/g, "") || String(Date.now());
        const file = eximFile!;
        const total = Math.max(1, Math.ceil(file.size / CHUNK));
        for (let i = 0; i < total; i++) {
          const chunk = file.slice(i * CHUNK, (i + 1) * CHUNK);
          const up = await fetch(
            `/api/exim/upload-part?uploadId=${uploadId}&index=${i}`,
            { method: "POST", body: chunk }
          );
          if (!up.ok) {
            const d = await up.json().catch(() => null);
            throw new Error(d?.error ?? `chunk ${i + 1}/${total} আপলোড ব্যর্থ`);
          }
        }
        res = await fetch("/api/exim/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId, total }),
        });
      } else {
        res = await fetch("/api/exim/import", { method: "POST", body: eximFile! });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "ইমপোর্ট ব্যর্থ হয়েছে");
      }
      return res.json();
    },
    onSuccess: (d) => {
      toast.success(`ইমপোর্ট সম্পন্ন! ${toBn(d.files ?? 0)}টি ফাইল ফেরানো হয়েছে — রিলোড হচ্ছে…`, { duration: 1500 });
      setTimeout(() => location.reload(), 1600);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const importing = doImport.isPending;

  const doBackup = useMutation({
    mutationFn: () => backupNow(),
    onSuccess: () => {
      toast.success("ব্যাকআপ ZIP নামানো হয়েছে");
      qc.invalidateQueries({ queryKey: ["backup-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRestore = useMutation({
    mutationFn: () => restoreBackup(file!),
    onSuccess: (d) => {
      toast.success(
        `রিস্টোর সম্পন্ন! ${toBn(d.restoredFiles)} ফাইল ফেরানো হয়েছে — পেজ রিলোড হচ্ছে...`,
        { duration: 1500 }
      );
      setTimeout(() => location.reload(), 1600);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoring = doRestore.isPending;
  const days = status?.daysSince ?? null;
  const info = statusInfo(days, status?.lastBackupAt ?? null);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && restoring) return; // block close while restoring
          onOpenChange(o);
        }}
      >
        <DialogContent
          className="glass-strong max-w-lg"
          onEscapeKeyDown={(e) => restoring && e.preventDefault()}
          onPointerDownOutside={(e) => restoring && e.preventDefault()}
          onInteractOutside={(e) => restoring && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bengali text-base">
              <span className="glass-strong flex h-8 w-8 items-center justify-center rounded-lg">
                <DatabaseBackup className="h-4 w-4 text-primary" />
              </span>
              ব্যাকআপ ও রিস্টোর
            </DialogTitle>
            <DialogDescription className="font-bengali">
              আপনার সব নোট, ফাইল ও লিংক একটি ZIP-এ সেভ হবে (ডাটাবেইজ + আপলোড ফোল্ডার)
            </DialogDescription>
          </DialogHeader>

          {/* status card */}
          <div className="glass flex items-start gap-3 rounded-xl p-3">
            <span
              className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", info.dot)}
              aria-hidden
            />
            <p className={cn("min-w-0 text-sm font-medium font-bengali", info.cls)} role="status">
              {info.text}
            </p>
          </div>

          {!cloudMode && (
          <>
          <Button
            onClick={() => doBackup.mutate()}
            disabled={doBackup.isPending || restoring}
            className="h-11 w-full gap-2 font-bengali text-[15px]"
          >
            {doBackup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {doBackup.isPending ? "ব্যাকআপ তৈরি হচ্ছে…" : "এখনই ব্যাকআপ ডাউনলোড করুন"}
          </Button>

          <Separator />

          {/* restore section */}
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground font-bengali">
              <FolderUp className="h-3.5 w-3.5 text-primary" />
              রিস্টোর (পুরনো ব্যাকআপ ফেরান)
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="ZIP ব্যাকআপ ফাইল নির্বাচন করুন"
            />
            <Button
              variant="outline"
              className="h-10 w-full justify-start gap-2 font-bengali"
              onClick={() => fileRef.current?.click()}
              disabled={restoring}
            >
              <FolderUp className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-mono text-xs">
                {file ? file.name : "ZIP ব্যাকআপ ফাইল বাছুন…"}
              </span>
            </Button>

            <Button
              variant="destructive"
              className="h-10 w-full gap-2 font-bengali"
              disabled={restoring}
              onClick={() => {
                if (!file) {
                  // no file picked yet — open the picker directly
                  fileRef.current?.click();
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              <ShieldAlert className="h-4 w-4" /> রিস্টোর করুন
            </Button>

            <p className="flex items-start gap-1 text-[11px] text-muted-foreground font-bengali">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              {file
                ? "রিস্টোর করলে বর্তমান সব ডেটা ব্যাকআপের ডেটায় প্রতিস্থাপিত হবে।"
                : "রিস্টোর চাপলে আগে ZIP ফাইল বাছার উইন্ডো খুলবে।"}
            </p>
          </div>
          </>
          )}

          {/* provider-agnostic transfer (works on laptop AND cloud) */}
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground font-bengali">
              <FileDown className="h-3.5 w-3.5 text-primary" />
              ডিভাইস / ক্লাউড ট্রান্সফার
            </p>
            <Button
              variant="outline"
              className="h-10 w-full gap-2 font-bengali"
              disabled={importing || restoring}
              onClick={() => { window.location.href = "/api/exim/export-data"; }}
            >
              <FileDown className="h-4 w-4 text-primary" /> শুধু ডেটা এক্সপোর্ট (JSON) — সবচেয়ে নির্ভরযোগ্য
            </Button>
            <Button
              variant="outline"
              className="h-10 w-full gap-2 font-bengali"
              disabled={importing || restoring}
              onClick={() => { window.location.href = "/api/exim/export"; }}
            >
              <FileDown className="h-4 w-4 text-primary" /> সম্পূর্ণ এক্সপোর্ট (ZIP, ফাইলসহ)
            </Button>

            <input
              ref={eximFileRef}
              type="file"
              accept=".zip,.json"
              className="hidden"
              onChange={(e) => setEximFile(e.target.files?.[0] ?? null)}
              aria-label="এক্সপোর্ট ZIP/JSON ফাইল নির্বাচন করুন"
            />
            <Button
              variant="outline"
              className="h-10 w-full justify-start gap-2 font-bengali"
              disabled={importing || restoring}
              onClick={() => eximFileRef.current?.click()}
            >
              <FileUp className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-mono text-xs">
                {eximFile ? eximFile.name : "ইমপোর্টের জন্য এক্সপোর্ট ZIP বাছুন…"}
              </span>
            </Button>
            <Button
              variant="destructive"
              className="h-10 w-full gap-2 font-bengali"
              disabled={importing || restoring}
              onClick={() => {
                if (!eximFile) {
                  eximFileRef.current?.click();
                  return;
                }
                setEximConfirm(true);
              }}
            >
              <ShieldAlert className="h-4 w-4" /> ইমপোর্ট করুন
            </Button>
            <p className="flex items-start gap-1 text-[11px] text-muted-foreground font-bengali">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              ল্যাপটপ → ক্লাউড: ল্যাপটপে <b>শুধু ডেটা এক্সপোর্ট (JSON)</b> ডাউনলোড করে, ক্লাউড URL-এ সেই JSON ফাইলটি আমদানি করুন — এতে সব নোট/কার্ড/MCQ নির্ভরযোগ্যভাবে আসবে (আপলোড করা PDF/ছবি আলাদা)। ইমপোর্ট বর্তমান ডেটা প্রতিস্থাপন করে।
            </p>
          </div>

          {/* importing overlay */}
          {importing && (
            <div
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/85 p-6 text-center backdrop-blur-sm"
              role="alert"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold font-bengali">ইমপোর্ট চলছে…</p>
              <p className="text-xs text-muted-foreground font-bengali">বড় ডেটায় কিছু সময় লাগতে পারে…</p>
            </div>
          )}

          {/* restoring overlay */}
          {restoring && (
            <div
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/85 p-6 text-center backdrop-blur-sm"
              role="alert"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold font-bengali">রিস্টোর চলছে…</p>
              <p className="text-xs text-muted-foreground font-bengali">
                বড় ব্যাকআপে কিছু সময় লাগতে পারে...
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* restore confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">সব কিছু প্রতিস্থাপিত হবে!</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              বর্তমান সব নোট, ফাইল, লিংক মুছে ব্যাকআপের ডেটা বসবে। নিশ্চিত?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-bengali text-white hover:bg-destructive/90"
              onClick={() => doRestore.mutate()}
            >
              হ্যাঁ, রিস্টোর করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* import confirmation */}
      <AlertDialog open={eximConfirm} onOpenChange={setEximConfirm}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">সব কিছু প্রতিস্থাপিত হবে!</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              বর্তমান সব নোট, ফাইল, ফ্ল্যাশকার্ড, MCQ মুছে এক্সপোর্ট ফাইলের ডেটা বসবে। নিশচিত?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-bengali text-white hover:bg-destructive/90"
              onClick={() => doImport.mutate()}
            >
              হ্যাঁ, ইমপোর্ট করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
