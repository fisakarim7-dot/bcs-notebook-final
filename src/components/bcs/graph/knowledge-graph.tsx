"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Network } from "lucide-react";
import { fetchGraph } from "@/lib/bcs-api";
import { useBcsStore } from "@/lib/bcs-store";

const KIND_COLOR: Record<string, string> = {
  node: "#149d8c",
  noteItem: "#6366f1",
  document: "#f59e0b",
  link: "#06b6d4",
  question: "#ec4899",
};

export function KnowledgeGraph() {
  const { data } = useQuery({ queryKey: ["graph"], queryFn: fetchGraph });
  const openNodeTab = useBcsStore((s) => s.openNodeTab);
  const selectNode = useBcsStore((s) => s.selectNode);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: Math.max(420, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const edges = data?.edges ?? [];
    const n = nodes.length;
    if (!n) return { nodes: [] as { x: number; y: number; id: string; title: string; kind: string }[], edges: [] as { x1: number; y1: number; x2: number; y2: number }[] };
    const cx = size.w / 2;
    const cy = size.h / 2;
    const r = Math.min(size.w, size.h) * 0.38;
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((nd, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      pos.set(nd.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    });
    return {
      nodes: nodes.map((nd) => ({ ...nd, ...(pos.get(nd.id) ?? { x: cx, y: cy }) })),
      edges: edges
        .map((e) => {
          const a = pos.get(e.source);
          const b = pos.get(e.target);
          if (!a || !b) return null;
          return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
        })
        .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number }[],
    };
  }, [data, size]);

  const onClick = (id: string, kind: string) => {
    const raw = id.split(":")[1];
    if (kind === "node") selectNode(raw);
    else if (kind === "noteItem") openNodeTab(raw, "notes");
    else if (kind === "document") openNodeTab(raw, "docs");
    else if (kind === "question") openNodeTab(raw, "questions");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 pb-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
          <Network className="h-5 w-5 text-primary" /> নলেজ গ্রাফ
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
          বিদ্যমান ক্রস-লিংক থেকে — নতুন ডেটা মডেল নেই। ক্লিকে ডিপ-লিংক।
        </p>
      </div>
      <div ref={wrap} className="glass relative h-[520px] overflow-hidden rounded-2xl">
        {!data || layout.nodes.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground font-bengali">
            এখনো কোনো সংযোগ নেই — নোট/প্রশ্নে «সম্পর্কিত কনটেন্ট» থেকে পিন করুন
          </p>
        ) : (
          <svg width={size.w} height={size.h} className="h-full w-full">
            {layout.edges.map((e, i) => (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--border)" strokeWidth={1.2} />
            ))}
            {layout.nodes.map((n) => (
              <g key={n.id} onClick={() => onClick(n.id, n.kind)} className="cursor-pointer">
                <circle cx={n.x} cy={n.y} r={8} fill={KIND_COLOR[n.kind] ?? "#888"} />
                <text x={n.x + 12} y={n.y + 4} fontSize={10} fill="var(--foreground)">
                  {n.title.slice(0, 22)}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      {data && (
        <p className="text-[11px] text-muted-foreground font-bengali">
          সংযোগ {data.totalEdges} · নোড {data.totalNodes} (শুধু সংযুক্তগুলো দেখানো)
        </p>
      )}
    </motion.div>
  );
}
