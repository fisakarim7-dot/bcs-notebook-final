"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchFavorites, toggleFavorite, type FavoriteDTO } from "@/lib/bcs-api";
import { cn } from "@/lib/utils";

/**
 * Universal 💜 favorite button — works for every content type in the app.
 * kind: "noteItem" | "document" | "link" | "question" | "node"
 * Optimistically toggles against the shared ["favorites"] cache.
 */
export function FavButton({
  kind,
  targetId,
  title,
  path,
  meta,
  className,
  size = "sm",
  label = "প্রিয়",
}: {
  kind: string;
  targetId: string;
  title?: string;
  path?: string;
  meta?: Record<string, unknown>;
  className?: string;
  size?: "xs" | "sm" | "md";
  label?: string;
}) {
  const qc = useQueryClient();

  const { data: favorites } = useQuery({
    queryKey: ["favorites"],
    queryFn: fetchFavorites,
    staleTime: 15_000,
  });
  const active = (favorites ?? []).some(
    (f) => f.kind === kind && f.targetId === targetId
  );

  const mut = useMutation({
    mutationFn: () => toggleFavorite({ kind, targetId, title, path, meta }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData<FavoriteDTO[]>(["favorites"]);
      if (prev) {
        const next = active
          ? prev.filter((f) => !(f.kind === kind && f.targetId === targetId))
          : [
              ...prev,
              {
                id: `optimistic-${kind}-${targetId}`,
                kind,
                targetId,
                title: title ?? "",
                path: path ?? "",
                meta: JSON.stringify(meta ?? {}),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ];
        qc.setQueryData(["favorites"], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["favorites"], ctx.prev);
      toast.error("প্রিয় সেভ করা যায়নি");
    },
    onSuccess: (favorited) => {
      toast.success(favorited ? `💜 ${label} প্রিয়তে সেভ হয়েছে` : "প্রিয় থেকে সরানো হয়েছে");
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const dim = size === "md" ? "h-9 w-9" : size === "xs" ? "h-6 w-6" : "h-7 w-7";
  const icon = size === "md" ? "h-4.5 w-4.5" : size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={active ? "প্রিয় থেকে সরান" : "প্রিয়তে সেভ করুন"}
          aria-pressed={active}
          disabled={mut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            mut.mutate();
          }}
          className={cn(
            dim,
            "shrink-0 transition-all",
            active
              ? "text-fuchsia-500 hover:text-fuchsia-500"
              : "text-muted-foreground/70 hover:text-fuchsia-500",
            className
          )}
        >
          {mut.isPending ? (
            <Loader2 className={cn(icon, "animate-spin")} />
          ) : (
            <Heart
              className={cn(icon, "transition-transform duration-200", active && "scale-110")}
              fill={active ? "currentColor" : "none"}
              strokeWidth={active ? 0 : 2}
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="font-bengali">
        {active ? "প্রিয় থেকে সরান" : "💜 প্রিয়তে সেভ করুন"}
      </TooltipContent>
    </Tooltip>
  );
}

