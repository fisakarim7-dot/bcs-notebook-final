"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ocrImage } from "@/lib/bcs-api";

export function OcrDialog({
  open,
  onOpenChange,
  onText,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onText?: (text: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");

  const run = useMutation({
    mutationFn: () => ocrImage(preview!),
    onSuccess: (d) => {
      setText(d.text);
      onText?.(d.text);
      toast.success("লেখা বের হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bengali">
            <ScanText className="h-4 w-4" /> OCR — ছবি থেকে লেখা
          </DialogTitle>
          <DialogDescription className="font-bengali">
            BYOK ভিশন মডেল লাগবে। কী না থাকলে AI সেটিংস খুলুন।
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => setPreview(String(r.result));
            r.readAsDataURL(f);
          }}
        />
        {preview && <img src={preview} alt="" className="max-h-40 rounded-lg object-contain" />}
        <Button disabled={!preview || run.isPending} onClick={() => run.mutate()} className="gap-1.5 font-bengali">
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
          লেখা বের করুন
        </Button>
        {text && <Textarea readOnly value={text} className="min-h-32 font-bengali text-xs" />}
      </DialogContent>
    </Dialog>
  );
}
