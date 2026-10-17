"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchNote, fetchTree, addLink, deleteLink, markRead } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { useBcsStore } from "@/lib/bcs-store";
import { ReadBadge } from "@/components/bcs/shared/read-badge";
import { FavButton } from "@/components/bcs/shared/fav-button";
import { namePathOf } from "@/lib/bcs-tree-utils";
import {
  Link2,
  Plus,
  ExternalLink,
  Trash2,
  Copy,
  HardDrive,
  Cloud,
  CloudDrizzle,
  Globe,
  BookOpen,
} from "lucide-react";

function providerBadge(provider: string) {
  switch (provider) {
    case "drive":
      return {
        icon: <CloudDrizzle className="h-3 w-3" />,
        label: "Google Drive",
        cls: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
      };
    case "onedrive":
      return {
        icon: <Cloud className="h-3 w-3" />,
        label: "OneDrive",
        cls: "text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/10",
      };
    case "dropbox":
      return {
        icon: <HardDrive className="h-3 w-3" />,
        label: "Dropbox",
        cls: "text-violet-600 dark:text-violet-300 border-violet-500/30 bg-violet-500/10",
      };
    default:
      return {
        icon: <Globe className="h-3 w-3" />,
        label: "Web",
        cls: "text-muted-foreground border-border",
      };
  }
}

export function SmartLinks({ nodeId }: { nodeId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

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

  const doAdd = useMutation({
    mutationFn: () => addLink({ noteId: nodeId, title, url }),
    onSuccess: () => {
      toast.success("স্মার্ট লিংক যোগ হয়েছে");
      setTitle("");
      setUrl("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteLink(id),
    onSuccess: () => {
      toast.success("লিংকটি ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRead = useMutation({
    mutationFn: (id: string) => markRead("link", id),
    onSuccess: (d) => {
      toast.success(`পঠন সংখ্যা: ${toBn(d.readCount)} বার`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!url.trim()) {
      toast.error("আগে একটি লিংক পেস্ট করুন");
      return;
    }
    doAdd.mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass rounded-xl p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground font-bengali">
          <Link2 className="h-3.5 w-3.5 text-primary" />
          লোকাল স্টোরেজ না খরচ করে ক্লাউড ডকুমেন্ট জুড়ুন
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="শিরোনাম (যেমন: সংবিধান PDF — Drive)"
            className="h-9 flex-1 font-bengali"
            aria-label="লিংকের শিরোনাম"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="https://drive.google.com/…"
            type="url"
            inputMode="url"
            className="h-9 flex-[1.4] flex-1 font-mono text-xs"
            aria-label="লিংক URL"
          />
          <Button onClick={submit} disabled={doAdd.isPending} className="h-9 gap-1.5 font-bengali">
            <Plus className="h-3.5 w-3.5" /> যুক্ত করুন
          </Button>
        </div>
      </div>

      {!note || note.links.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground font-bengali">
          এখনো কোনো স্মার্ট লিংক নেই। উপরে Google Drive / OneDrive / Dropbox লিংক পেস্ট করুন।
        </p>
      ) : (
        <ul className="grid gap-2">
          {note.links.map((link) => {
            const badge = providerBadge(link.provider);
            return (
              <li
                key={link.id}
                className="glass group flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_14px_var(--glow)]"
              >
                <span className="glass-strong flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <Link2 className="h-4.5 w-4.5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium font-bengali" title={link.title}>
                    {link.title}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground font-mono" title={link.url}>
                    {link.url}
                  </p>
                </div>
                <Badge variant="outline" className={`hidden shrink-0 gap-1 sm:flex ${badge.cls}`}>
                  {badge.icon} {badge.label}
                </Badge>
                <ReadBadge count={link.readCount ?? 0} compact />
                <FavButton
                  kind="link"
                  targetId={link.id}
                  title={link.title}
                  path={nodePath}
                  meta={{ url: link.url, nodeId }}
                  label="লিংক"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 sm:h-7 sm:w-7"
                      aria-label="+১ পড়া হলো"
                      onClick={() => doRead.mutate(link.id)}
                      disabled={doRead.isPending && doRead.variables === link.id}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="font-bengali">+১ পড়া হলো</TooltipContent>
                </Tooltip>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 sm:h-7 sm:w-7"
                        aria-label={`লিংক কপি করুন: ${link.title}`}
                        onClick={() => {
                          navigator.clipboard
                            .writeText(link.url)
                            .then(() => toast.success("লিংক কপি হয়েছে"))
                            .catch(() => toast.error("কপি করা যায়নি"));
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bengali">লিংক কপি</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`খুলুন: ${link.title}`}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary sm:h-7 sm:w-7"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent className="font-bengali">নতুন ট্যাবে খুলুন</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-muted-foreground hover:bg-destructive/15 hover:text-destructive sm:h-7 sm:w-7"
                        aria-label={`লিংক মুছুন: ${link.title}`}
                        onClick={() => doDelete.mutate(link.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bengali">মুছে ফেলুন</TooltipContent>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
