"use client";

/**
 * StorageMeter — dashboard widget showing free-tier storage usage:
 *   • ডাটাবেজ (Neon Postgres 0.5 GB free / local SQLite unlimited)
 *   • ছবি ও ফাইল (Vercel Blob ~1 GB free / local disk unlimited)
 *
 * Data comes from GET /api/storage-usage. Blob listing is server-cached
 * for 5 minutes so we don't burn billable list() operations.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Database, HardDrive, Images, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";

interface StorageUsage {
  db: { usedBytes: number; limitBytes: number | null; mode: string };
  files: {
    usedBytes: number;
    fileCount: number;
    limitBytes: number | null;
    mode: string;
  };
}

async function fetchStorageUsage(): Promise<StorageUsage> {
  const res = await fetch("/api/storage-usage");
  if (!res.ok) throw new Error("স্টোরেজ তথ্য আনা যায়নি");
  return res.json();
}

function Meter({
  icon,
  label,
  sub,
  usedBytes,
  limitBytes,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  usedBytes: number;
  limitBytes: number | null;
  extra?: string;
}) {
  const pct =
    limitBytes && limitBytes > 0
      ? Math.min(100, (usedBytes / limitBytes) * 100)
      : 0;
  const bar =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-semibold font-bengali">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground font-bengali">
          {formatBytes(usedBytes)}
          {limitBytes ? ` / ${formatBytes(limitBytes)}` : " (আনলিমিটেড)"}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {limitBytes ? (
          <div
            className={cn("h-full rounded-full transition-all", bar)}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-full rounded-full bg-primary/25" />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground font-bengali">
        {sub}
        {extra ? ` · ${extra}` : ""}
        {limitBytes && pct >= 90
          ? " · ⚠️ প্রায় ভরে গেছে — ব্যাকআপ নিন"
          : ""}
      </p>
    </div>
  );
}

export function StorageMeter() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["storage-usage"],
    queryFn: fetchStorageUsage,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold font-bengali">স্টোরেজ ব্যবহার</h2>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["storage-usage"] });
            refetch();
          }}
          disabled={isFetching}
          aria-label="রিফ্রেশ করুন"
          title="রিফ্রেশ করুন"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
          />
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground font-bengali">
          মাপা হচ্ছে…
        </p>
      ) : isError || !data ? (
        <p className="text-xs text-muted-foreground font-bengali">
          স্টোরেজ তথ্য আনা যায়নি — পরে আবার চেষ্টা করুন।
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Meter
            icon={<Database className="h-4 w-4" />}
            label="ডাটাবেজ"
            sub={
              data.db.mode === "postgres"
                ? "Neon ফ্রি টিয়ার (ক্লাউড)"
                : "SQLite — নিজের ডিস্ক (অফলাইন)"
            }
            usedBytes={data.db.usedBytes}
            limitBytes={data.db.limitBytes}
          />
          <Meter
            icon={<Images className="h-4 w-4" />}
            label="ছবি ও ফাইল"
            sub={
              data.files.mode === "blob"
                ? "Vercel Blob ফ্রি টিয়ার (ক্লাউড)"
                : "লোকাল ডিস্ক (অফলাইন)"
            }
            usedBytes={data.files.usedBytes}
            limitBytes={data.files.limitBytes}
            extra={`${data.files.fileCount}টি ফাইল`}
          />
        </div>
      )}
    </motion.section>
  );
}
