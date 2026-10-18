"use client";

import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toBn } from "@/lib/bcs-types";

interface ReadBadgeProps {
  count: number;
  /** compact = icon + Bengali-digit count only (for dense file/link cards) */
  compact?: boolean;
  className?: string;
}

/**
 * Dumb display-only badge for read-tracking counts.
 * Pages call markRead() themselves and pass the fresh count here.
 */
export function ReadBadge({ count, compact, className }: ReadBadgeProps) {
  if (compact) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-0.5 px-1.5 text-[10px] leading-none",
          count > 0
            ? "border-primary/30 bg-primary/5 text-primary"
            : "text-muted-foreground",
          className
        )}
        title={count > 0 ? `${toBn(count)} বার পড়া হয়েছে` : "পড়া হয়নি"}
      >
        <BookOpen className="h-3 w-3" />
        {toBn(count)}
      </Badge>
    );
  }

  if (count > 0) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-primary/30 bg-primary/5 font-bengali text-primary",
          className
        )}
      >
        <BookOpen className="h-3 w-3" />
        {toBn(count)} বার পড়া হয়েছে
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-bengali text-muted-foreground", className)}
    >
      <BookOpen className="h-3 w-3" />
      পড়া হয়নি
    </Badge>
  );
}
