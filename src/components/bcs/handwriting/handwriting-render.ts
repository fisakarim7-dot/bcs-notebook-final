"use client";

import { getStroke } from "perfect-freehand";
import type { HwStroke } from "@/lib/bcs-types";

/** লজিক্যাল পেজ সাইজ (A4 অনুপাত) — সব কোঅর্ডিনেট এই স্কেলে সেভ হয় */
export const HW_PAGE_W = 800;
export const HW_PAGE_H = 1131;

/** স্ট্রোকের আউটলাইন পলিগন — Apple Pencil-এর pressure অনুযায়ী মোটা/চিকন */
export function strokeOutline(s: HwStroke): number[][] {
  const pts = s.points.map((p) => [p[0], p[1], p[2]]);
  const outline = getStroke(pts, {
    size: s.size,
    thinning: s.tool === "pen" ? 0.62 : 0,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: false,
    last: true,
  });
  return outline as number[][];
}

function tracePath(ctx: CanvasRenderingContext2D, outline: number[][]) {
  if (outline.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    ctx.lineTo(outline[i][0], outline[i][1]);
  }
  ctx.closePath();
}

/** একটা স্ট্রোক আঁকো */
export function drawStroke(ctx: CanvasRenderingContext2D, s: HwStroke) {
  const outline = strokeOutline(s);
  if (outline.length === 0) return;
  ctx.save();
  if (s.tool === "highlighter") ctx.globalAlpha = 0.38;
  ctx.fillStyle = s.color;
  tracePath(ctx, outline);
  ctx.fill();
  ctx.restore();
}

/** পুরো পেজ আঁকো */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: HwStroke[]) {
  for (const s of strokes) drawStroke(ctx, s);
}

/** ইরেজার হিট-টেস্ট — পয়েন্টার কোনো স্ট্রোকের গায়ে লেগেছে? (segment distance) */
export function strokeHit(s: HwStroke, x: number, y: number, radius: number): boolean {
  const pad = s.size / 2 + radius;
  const pad2 = pad * pad;
  const pts = s.points;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - x;
    const dy = pts[i][1] - y;
    if (dx * dx + dy * dy < pad2) return true;
    if (i > 0) {
      const ax = pts[i - 1][0];
      const ay = pts[i - 1][1];
      const abx = pts[i][0] - ax;
      const aby = pts[i][1] - ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 === 0 ? 0 : ((x - ax) * abx + (y - ay) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * abx - x;
      const cy = ay + t * aby - y;
      if (cx * cx + cy * cy < pad2) return true;
    }
  }
  return false;
}

/** PNG এক্সপোর্ট — সাদা ব্যাকগ্রাউন্ডে 2x রেজোলিউশন */
export function renderPageToDataURL(
  strokes: HwStroke[],
  background: string
): string {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = HW_PAGE_W * scale;
  canvas.height = HW_PAGE_H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.fillStyle = background === "blank" ? "#ffffff" : "#fffdf5";
  ctx.fillRect(0, 0, HW_PAGE_W, HW_PAGE_H);
  drawStrokes(ctx, strokes);
  return canvas.toDataURL("image/png");
}
