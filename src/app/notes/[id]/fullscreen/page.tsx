"use client";

/**
 * Full-screen note editor — opened in a new browser tab from the
 * note section ("ফুল স্ক্রিন" button). Renders the SAME shared RichEditor
 * component + toolbar, so every rich-text feature (shading, shadow/border,
 * font size, tables, image upload/paste, etc.) works identically.
 *
 * Persistence: identical debounced autosave (800ms) to /api/note-items/[id].
 * "নোটে ফিরুন" flushes pending edits and closes the window; the opener
 * refetches the note on window focus, so nothing is lost.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchNoteItem, updateNoteItem } from "@/lib/bcs-api";
import type { EditorSaveState } from "@/components/bcs/editor/rich-toolbar";

const RichEditor = dynamic(
  () =>
    import("@/components/bcs/workspace/rich-editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />{" "}
        <span className="font-bengali">এডিটর লোড হচ্ছে…</span>
      </div>
    ),
  }
);

const savedTimeFmt = new Intl.DateTimeFormat("bn-BD", {
  hour: "2-digit",
  minute: "2-digit",
});

export default function FullscreenNotePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [font, setFont] = useState<"kalpurush" | "times">("kalpurush");
  const [saveState, setSaveState] = useState<EditorSaveState>("idle");
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null);

  const lastSaved = useRef({ title: "", content: "" });
  const firstRun = useRef(true);
  const stateRef = useRef({ title: "", content: "" });
  stateRef.current = { title, content };

  // initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const item = await fetchNoteItem(id);
        if (cancelled) return;
        setTitle(item.title);
        setContent(item.content);
        setFont(item.font === "times" ? "times" : "kalpurush");
        lastSaved.current = { title: item.title, content: item.content };
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : "নোট লোড করা যায়নি");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const doSave = useCallback(
    async (patch: { title?: string; content?: string; font?: string }) => {
      try {
        await updateNoteItem(id, patch);
        if (patch.title !== undefined) lastSaved.current.title = patch.title;
        if (patch.content !== undefined)
          lastSaved.current.content = patch.content;
        setSaveState("saved");
        setSavedAtLabel(savedTimeFmt.format(new Date()));
      } catch (e) {
        setSaveState("idle");
        console.error("fullscreen autosave failed:", e);
      }
    },
    [id]
  );
  const doSaveRef = useRef(doSave);
  useEffect(() => {
    doSaveRef.current = doSave;
  });

  // debounced autosave (800ms) — same rhythm as the in-app editor
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      const patch: { title?: string; content?: string } = {};
      if (title !== lastSaved.current.title) patch.title = title;
      if (content !== lastSaved.current.content) patch.content = content;
      if (Object.keys(patch).length === 0) {
        setSaveState("idle");
        return;
      }
      void doSaveRef.current(patch);
    }, 800);
    return () => clearTimeout(t);
  }, [title, content]);

  // flush helper shared by back-button + beforeunload
  const flushPending = useCallback(async (): Promise<boolean> => {
    const { title: t, content: c } = stateRef.current;
    const patch: { title?: string; content?: string } = {};
    if (t !== lastSaved.current.title) patch.title = t;
    if (c !== lastSaved.current.content) patch.content = c;
    if (Object.keys(patch).length === 0) return true;
    try {
      await doSaveRef.current(patch);
      return true;
    } catch {
      return false;
    }
  }, []);

  // safety net: try to persist on tab/window close (keepalive)
  useEffect(() => {
    const onBeforeUnload = () => {
      const { title: t, content: c } = stateRef.current;
      const patch: { title?: string; content?: string } = {};
      if (t !== lastSaved.current.title) patch.title = t;
      if (c !== lastSaved.current.content) patch.content = c;
      if (Object.keys(patch).length === 0) return;
      try {
        fetch(`/api/note-items/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
          keepalive: true,
        });
      } catch {
        /* best effort only */
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [id]);

  const handleBack = async () => {
    await flushPending();
    // tab was opened via window.open from the app → close returns to the note section
    window.close();
    // fallback: if the browser refused to close, navigate home instead
    // of leaving the user stranded
    setTimeout(() => {
      if (!window.closed) router.push("/");
    }, 350);
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-bengali">নোট লোড হচ্ছে…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-bengali text-destructive">{loadError}</p>
        <Button variant="outline" onClick={handleBack} className="font-bengali">
          <ArrowLeft className="h-4 w-4" /> ফিরে যান
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      {/* top bar */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          className="gap-1.5 font-bengali"
        >
          <ArrowLeft className="h-4 w-4" /> নোটে ফিরুন
        </Button>
        <span
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="font-bengali">সেভ হচ্ছে…</span>
            </>
          ) : saveState === "saved" && savedAtLabel ? (
            <>
              <CloudUpload className="h-3 w-3 text-primary" />
              <span className="font-bengali">সংরক্ষিত {savedAtLabel}</span>
            </>
          ) : null}
        </span>
        <div className="ml-auto text-[11px] text-muted-foreground">
          <span className="font-bengali">ফুল স্ক্রিন এডিটর</span>
        </div>
      </div>

      {/* title + editor, full height — পুরো স্ক্রিন জুড়ে */}
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col px-4 pb-4 pt-2 sm:px-8">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("saving");
          }}
          placeholder="নোটের শিরোনাম"
          aria-label="নোটের শিরোনাম"
          className="mb-2 h-11 shrink-0 border-none bg-transparent px-0 text-lg font-bold font-bengali shadow-none focus-visible:ring-0 md:text-xl"
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <RichEditor
            value={content}
            onChange={(v) => {
              setContent(v);
              setSaveState("saving");
            }}
            font={font}
            onFontChange={(f) => {
              setFont(f);
              setSaveState("saving");
              void doSaveRef.current({ font: f });
            }}
            saveState={saveState}
          />
        </div>
      </div>
    </div>
  );
}
