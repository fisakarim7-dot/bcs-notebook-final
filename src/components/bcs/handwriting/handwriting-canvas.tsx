"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { HwPoint, HwStroke } from "@/lib/bcs-types";
import {
  HW_PAGE_H,
  HW_PAGE_W,
  drawStrokes,
  strokeHit,
} from "./handwriting-render";

export type HwTool = "pen" | "highlighter" | "eraser";

export interface HandwritingStats {
  canUndo: boolean;
  canRedo: boolean;
  strokeCount: number;
}

export interface HandwritingCanvasHandle {
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
}

interface Props {
  initialStrokes: HwStroke[];
  tool: HwTool;
  color: string;
  size: number;
  /** বন্ধ থাকলে আঙুলে শুধু স্ক্রল হবে, আঁকা যাবে না (পেন্সিল/মাউসে আঁকা যাবে) */
  fingerDraw: boolean;
  onChange: (strokes: HwStroke[]) => void;
  onStats: (stats: HandwritingStats) => void;
}

function pressureOf(e: React.PointerEvent): number {
  if (e.pointerType === "mouse") return 0.5;
  return e.pressure > 0 ? Math.min(1, e.pressure) : 0.5;
}

export const HandwritingCanvas = forwardRef<HandwritingCanvasHandle, Props>(
  function HandwritingCanvas(
    { initialStrokes, tool, color, size, fingerDraw, onChange, onStats },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dprRef = useRef(1);
    const strokesRef = useRef<HwStroke[]>(initialStrokes);
    const pastRef = useRef<HwStroke[][]>([]);
    const futureRef = useRef<HwStroke[][]>([]);
    const drawingRef = useRef<{ pointerId: number; points: HwPoint[] } | null>(null);
    const erasingRef = useRef<{ pointerId: number } | null>(null);
    const toolRef = useRef(tool);
    const colorRef = useRef(color);
    const sizeRef = useRef(size);
    const fingerDrawRef = useRef(fingerDraw);
    const onChangeRef = useRef(onChange);
    const onStatsRef = useRef(onStats);

    toolRef.current = tool;
    colorRef.current = color;
    sizeRef.current = size;
    fingerDrawRef.current = fingerDraw;
    onChangeRef.current = onChange;
    onStatsRef.current = onStats;

    const emitStats = useCallback(() => {
      onStatsRef.current({
        canUndo: pastRef.current.length > 0,
        canRedo: futureRef.current.length > 0,
        strokeCount: strokesRef.current.length,
      });
    }, []);

    const redraw = useCallback((extra?: HwStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, HW_PAGE_W, HW_PAGE_H);
      drawStrokes(ctx, strokesRef.current);
      if (extra) drawStrokes(ctx, [extra]);
    }, []);

    // ক্যানভাস সেটআপ (DPR)
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      dprRef.current = dpr;
      canvas.width = Math.round(HW_PAGE_W * dpr);
      canvas.height = Math.round(HW_PAGE_H * dpr);
      redraw();
      emitStats();
    }, [redraw, emitStats]);

    const applyStrokes = useCallback(
      (next: HwStroke[], recordHistory: boolean) => {
        if (recordHistory) {
          pastRef.current.push(strokesRef.current);
          if (pastRef.current.length > 60) pastRef.current.shift();
          futureRef.current = [];
        }
        strokesRef.current = next;
        redraw();
        onChangeRef.current(next);
        emitStats();
      },
      [redraw, emitStats]
    );

    const eraseAt = useCallback(
      (x: number, y: number) => {
        const radius = 14;
        const hit = strokesRef.current.some((s) => strokeHit(s, x, y, radius));
        if (!hit) return;
        const next = strokesRef.current.filter((s) => !strokeHit(s, x, y, radius));
        applyStrokes(next, false);
      },
      [applyStrokes]
    );

    const undo = useCallback(() => {
      const past = pastRef.current;
      if (past.length === 0) return;
      futureRef.current.push(strokesRef.current);
      const next = past.pop()!;
      strokesRef.current = next;
      redraw();
      onChangeRef.current(next);
      emitStats();
    }, [redraw, emitStats]);

    const redo = useCallback(() => {
      const future = futureRef.current;
      if (future.length === 0) return;
      pastRef.current.push(strokesRef.current);
      const next = future.pop()!;
      strokesRef.current = next;
      redraw();
      onChangeRef.current(next);
      emitStats();
    }, [redraw, emitStats]);

    const clearAll = useCallback(() => {
      if (strokesRef.current.length === 0) return;
      applyStrokes([], true);
    }, [applyStrokes]);

    useImperativeHandle(ref, () => ({ undo, redo, clearAll }), [undo, redo, clearAll]);

    const toLogical = (e: React.PointerEvent): [number, number] => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      return [
        ((e.clientX - rect.left) / rect.width) * HW_PAGE_W,
        ((e.clientY - rect.top) / rect.height) * HW_PAGE_H,
      ];
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (drawingRef.current || erasingRef.current) return; // পাম রিজেকশন
      if (e.pointerType === "touch" && !fingerDrawRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      const [x, y] = toLogical(e);
      if (toolRef.current === "eraser") {
        erasingRef.current = { pointerId: e.pointerId };
        pastRef.current.push(strokesRef.current);
        if (pastRef.current.length > 60) pastRef.current.shift();
        futureRef.current = [];
        eraseAt(x, y);
        return;
      }
      drawingRef.current = {
        pointerId: e.pointerId,
        points: [[x, y, pressureOf(e)] as HwPoint],
      };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const [x, y] = toLogical(e);
      const d = drawingRef.current;
      if (d && e.pointerId === d.pointerId) {
        const last = d.points[d.points.length - 1];
        const dx = last[0] - x;
        const dy = last[1] - y;
        if (dx * dx + dy * dy < 1.2) return; // খুব কাছের পয়েন্ট বাদ
        d.points.push([x, y, pressureOf(e)] as HwPoint);
        redraw({
          tool: toolRef.current === "highlighter" ? "highlighter" : "pen",
          color: colorRef.current,
          size: sizeRef.current,
          points: d.points,
        });
        return;
      }
      const er = erasingRef.current;
      if (er && e.pointerId === er.pointerId) {
        eraseAt(x, y);
      }
    };

    const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drawingRef.current;
      if (d && e.pointerId === d.pointerId) {
        drawingRef.current = null;
        if (d.points.length > 0) {
          applyStrokes(
            [
              ...strokesRef.current,
              {
                tool: toolRef.current === "highlighter" ? "highlighter" : "pen",
                color: colorRef.current,
                size: sizeRef.current,
                points: d.points,
              },
            ],
            true
          );
        } else {
          redraw();
        }
        return;
      }
      if (erasingRef.current && e.pointerId === erasingRef.current.pointerId) {
        erasingRef.current = null;
        emitStats();
      }
    };

    return (
      <canvas
        ref={canvasRef}
        className="block h-auto w-full"
        style={{
          aspectRatio: `${HW_PAGE_W} / ${HW_PAGE_H}`,
          touchAction: fingerDraw ? "none" : "pan-y",
          cursor: tool === "eraser" ? "cell" : "crosshair",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  }
);
