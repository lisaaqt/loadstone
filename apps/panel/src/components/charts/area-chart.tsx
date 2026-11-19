"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

export interface Point {
  t: number;
  v: number;
}

interface AreaChartProps {
  data: Point[];
  max?: number;
  height?: number;
  unit?: "percent" | "bytes" | "number" | "cores";
  className?: string;
  color?: string;
  emptyLabel?: string;
  sparkline?: boolean;
}

const W = 600;

const FORMATTERS: Record<NonNullable<AreaChartProps["unit"]>, (v: number) => string> = {
  percent: (v) => `${v.toFixed(1)}%`,
  bytes: (v) => formatBytes(v),
  number: (v) => v.toFixed(0),
  cores: (v) => `${(v / 100).toFixed(2)} cores`,
};

export function AreaChart({ data, max, height = 120, unit = "number", className, color = "var(--primary)", emptyLabel = "No data yet", sparkline = false }: AreaChartProps) {
  const format = FORMATTERS[unit];
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { line, area, points } = useMemo(() => {
    if (data.length < 2) return { line: "", area: "", points: [] as { x: number; y: number }[] };
    const t0 = data[0]!.t;
    const t1 = data[data.length - 1]!.t;
    const top = max ?? Math.max(1, ...data.map((d) => d.v)) * 1.15;
    const pts = data.map((d) => ({
      x: ((d.t - t0) / Math.max(1, t1 - t0)) * W,
      y: height - 4 - (Math.min(d.v, top) / top) * (height - 12),
    }));
    let path = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const c = pts[i]!;
      const mx = (p.x + c.x) / 2;
      path += ` C ${mx} ${p.y}, ${mx} ${c.y}, ${c.x} ${c.y}`;
    }
    return { line: path, area: `${path} L ${W} ${height} L 0 ${height} Z`, points: pts };
  }, [data, max, height]);

  if (data.length < 2) {
    if (sparkline) {
      return (
        <div className={cn("flex items-end", className)} style={{ height }}>
          <div className="h-px w-full bg-[linear-gradient(90deg,transparent,var(--border-strong),transparent)]" />
        </div>
      );
    }
    return (
      <div className={cn("flex items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-2/30 text-xs text-subtle", className)} style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i]!.x - x) < Math.abs(points[best]!.x - x)) best = i;
    setHover(best);
  }

  const hp = hover !== null ? points[hover] : null;
  const hd = hover !== null ? data[hover] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={sparkline ? "0.28" : "0.22"} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {!sparkline && [0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="var(--border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#g-${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={sparkline ? "1.75" : "2"} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hp && <line x1={hp.x} x2={hp.x} y1="0" y2={height} stroke="var(--border-strong)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && hd && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface px-2 py-1 text-[11px] shadow-pop dark:bg-surface-3"
          style={{ left: `${Math.min(92, Math.max(8, (hp.x / W) * 100))}%` }}
        >
          <span className="font-medium tabular">{format(hd.v)}</span>
          <span className="ml-1.5 text-muted">{new Date(hd.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}
    </div>
  );
}
