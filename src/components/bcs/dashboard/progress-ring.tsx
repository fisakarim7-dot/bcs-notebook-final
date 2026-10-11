"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ProgressRing({
  percent,
  size = 92,
  stroke = 8,
  color,
  label,
  sublabel,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: string;
  label?: string;
  sublabel?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={color}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 5px ${color}55)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold leading-none">{clamped}%</span>
          {label && <span className="mt-0.5 text-[10px] text-muted-foreground">{label}</span>}
        </div>
      </div>
      {sublabel && (
        <p
          className="max-w-[120px] truncate text-center text-[11px] font-medium font-bengali"
          title={sublabel}
        >
          {sublabel}
        </p>
      )}
    </div>
  );
}

export function CountdownRing({
  secondsLeft,
  totalSeconds,
  size = 190,
  children,
  running,
}: {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  children?: React.ReactNode;
  running: boolean;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const color = running ? "var(--primary)" : "var(--muted-foreground)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear")}
          style={running ? { filter: "drop-shadow(0 0 8px var(--glow))" } : undefined}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
