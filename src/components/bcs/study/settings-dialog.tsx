"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { fetchAiSettings, saveAiSettings, testAi } from "@/lib/bcs-api";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

const PRESETS = [
  { label: "Z.ai (Global)", base: "https://api.z.ai/api/paas/v4", hint: "z.ai থেকে নেওয়া key" },
  {
    label: "BigModel (China)",
    base: "https://open.bigmodel.cn/api/paas/v4",
    hint: "open.bigmodel.cn থেকে নেওয়া key",
  },
];

interface SettingsData {
  hasKey: boolean;
  keyMasked: string;
  apiBase: string;
  model: string;
  studyPrefs?: { srs: "leitner" | "fsrs"; interleave: boolean; tts: boolean };
}

/** Keyed form — remounts when loaded settings change so fields re-initialize. */
function SettingsForm({ settings }: { settings: SettingsData | undefined }) {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState(settings?.apiBase ?? "");
  const [model, setModel] = useState(settings?.model ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [srs, setSrs] = useState<"leitner" | "fsrs">(settings?.studyPrefs?.srs ?? "leitner");
  const [interleave, setInterleave] = useState(settings?.studyPrefs?.interleave ?? false);
  const [tts, setTts] = useState(settings?.studyPrefs?.tts ?? false);

  const save = useMutation({
    mutationFn: () => {
      const payload: {
        apiKey?: string;
        apiBase?: string;
        model?: string;
        studyPrefs: { srs: "leitner" | "fsrs"; interleave: boolean; tts: boolean };
      } = {
        apiBase,
        model,
        studyPrefs: { srs, interleave, tts },
      };
      if (apiKey.trim().length > 0) payload.apiKey = apiKey.trim();
      return saveAiSettings(payload);
    },
    onSuccess: (s) => {
      toast.success("সেটিংস সংরক্ষিত হয়েছে");
      setApiKey("");
      qc.setQueryData(["ai-settings"], s);
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearKey = useMutation({
    mutationFn: () => saveAiSettings({ apiKey: "" }),
    onSuccess: (s) => {
      toast.success("API key মুছে ফেলা হয়েছে");
      setApiKey("");
      qc.setQueryData(["ai-settings"], s);
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: testAi,
    onSuccess: (r) => {
      setTestResult({
        ok: true,
        msg: `সংযোগ সফল ✔ (${r.provider === "byok" ? r.model : "বিল্ট-ইন AI"})`,
      });
    },
    onError: (e: Error) => setTestResult({ ok: false, msg: e.message }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-[11px] leading-6 text-emerald-700 dark:text-emerald-400 font-bengali">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Key শুধু এই ডিভাইসের ডেটাবেজে সংরক্ষিত থাকে — কোডে হার্ডকোড হয় না,
          ZIP শেয়ার করলেও যাবে না, শুধু AI প্রোভাইডারের কাছে যায়।
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="font-bengali">API Key</Label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              placeholder={
                settings?.hasKey
                  ? `সংরক্ষিত: ${settings.keyMasked} (বদলাতে নতুন key লিখুন)`
                  : "যেমন: abc123….xyz"
              }
              className="h-10 pr-9 font-mono text-xs"
              aria-label="API Key"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? "key লুকান" : "key দেখান"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {settings?.hasKey && (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10"
              aria-label="key মুছে ফেলুন"
              onClick={() => clearKey.mutate()}
              disabled={clearKey.isPending}
            >
              {clearKey.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <a
          href="https://z.ai/model-api"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-[11px] text-primary hover:underline"
        >
          ফ্রী key পাওয়ার জায়গা (Z.ai) <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="font-bengali">API Base URL</Label>
        <Input
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          className="h-10 font-mono text-xs"
          aria-label="API Base URL"
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.base}
              type="button"
              onClick={() => setApiBase(p.base)}
              className={cn(
                "rounded-lg border px-2 py-1 text-[10px] font-bengali transition-colors",
                apiBase === p.base
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-primary/40"
              )}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="font-bengali">মডেলের নাম</Label>
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="h-10 font-mono text-xs"
          aria-label="মডেল"
          placeholder="glm-4.7-flash"
        />
        <p className="text-[11px] text-muted-foreground font-bengali">
          ফ্রী টিয়ারের জন্য Flash মডেলই যথেষ্ট — ভবিষ্যতে মডেল বদলালে এখানে
          শুধু নাম লিখলেই হবে।
        </p>
      </div>

      <div className="rounded-xl border border-border/60 p-3">
        <p className="mb-2 text-xs font-bold font-bengali">স্টাডি প্রেফারেন্স (নতুন — Leitner ডিফল্ট অক্ষুণ্ণ)</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-2 text-xs font-bengali">
            <span>শিডিউলার</span>
            <select
              value={srs}
              onChange={(e) => setSrs(e.target.value === "fsrs" ? "fsrs" : "leitner")}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="leitner">Leitner (আগের মতো)</option>
              <option value="fsrs">FSRS (আধুনিক, অপশন)</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs font-bengali">
            <span>ইন্টারলিভিং (বিষয় মিশিয়ে কিউ)</span>
            <Switch checked={interleave} onCheckedChange={setInterleave} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs font-bengali">
            <span>বাংলা TTS (কার্ড শোনা)</span>
            <Switch checked={tts} onCheckedChange={setTts} />
          </label>
        </div>
      </div>

      {testResult && (
        <p
          className={cn(
            "rounded-xl p-3 text-xs leading-6 font-bengali",
            testResult.ok
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          )}
        >
          {testResult.msg}
        </p>
      )}

      <DialogFooter className="flex-wrap gap-2">
        <div className="mr-auto flex items-center gap-2">
          {settings?.hasKey && (
            <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
              <PlugZap className="h-3 w-3" /> key সংরক্ষিত ({settings.keyMasked})
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          className="gap-1.5 font-bengali"
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlugZap className="h-4 w-4" />
          )}
          সংযোগ পরীক্ষা
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5 font-bengali">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          সংরক্ষণ
        </Button>
      </DialogFooter>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: settings } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: fetchAiSettings,
    enabled: open,
  });

  // key makes the form remount (and re-initialize) once settings load/change
  const formKey = settings ? `${settings.apiBase}|${settings.model}|${settings.hasKey}` : "loading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bengali">
            <Cpu className="h-5 w-5 text-primary" /> AI সেটিংস (BYOK)
          </DialogTitle>
          <DialogDescription className="font-bengali">
            নিজের GLM API key বসালে ল্যাপটপ ZIP-এও AI ফিচার চলবে (ইন্টারনেট লাগবে)।
          </DialogDescription>
        </DialogHeader>

        <SettingsForm key={formKey} settings={settings} />
      </DialogContent>
    </Dialog>
  );
}
