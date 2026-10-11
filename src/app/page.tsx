"use client";

import dynamic from "next/dynamic";
import { NotebookPen } from "lucide-react";

// The app is a fully interactive, data-driven dashboard — rendering it
// client-side avoids SSR/hydration issues with Radix auto-generated ids.
const AppShell = dynamic(
  () => import("@/components/bcs/app-shell").then((m) => m.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <span className="glass-strong pulse-glow flex h-16 w-16 items-center justify-center rounded-2xl">
          <NotebookPen className="h-7 w-7 text-primary" />
        </span>
        <div className="text-center">
          <p className="text-lg font-bold tracking-tight">
            <span className="text-gradient">BCS Written</span> Tree-Notebook
          </p>
          <p className="mt-1 font-bengali text-xs text-muted-foreground">
            আপনার স্টাডি ওয়ার্কস্পেস লোড হচ্ছে…
          </p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return <AppShell />;
}
