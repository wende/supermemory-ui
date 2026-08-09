"use client";

import { useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Chart primitives.

   Colour roles come from globals.css (validated dataviz palette, dark
   steps). Rules held to here: 2px lines, >=8px hover markers, 2px
   surface gaps between adjacent fills, 4px rounded data ends, legend
   whenever there are two or more series, recessive grid, and a hover
   layer on every plotted form.
   ------------------------------------------------------------------ */

const GRID = "var(--color-grid)";
const AXIS = "var(--color-axis)";
const MUTED = "color-mix(in oklab, var(--brand-black) 55%, transparent)";

/* ------------------------------------------------------------------ */
/* Stat tile — a number, not a chart                                   */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  hint,
  delta,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: string; good: boolean };
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-brand-black/[0.06] bg-card px-5 py-5 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
      {accent && (
        <span
          className="absolute inset-y-0 left-0 w-[2px]"
          style={{ background: accent }}
          aria-hidden
        />
      )}
      <div className="label">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl leading-none font-semibold tracking-tight text-brand-black">
          {value}
        </span>
        {delta && (
          <span
            className="text-xs font-medium"
            style={{
              color: delta.good ? "var(--color-good)" : "color-mix(in oklab, var(--brand-black) 55%, transparent)",
            }}
          >
            {delta.value}
          </span>
        )}
      </div>
      {hint && <div className="mt-1.5 text-xs text-brand-black/55">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Two-series line chart with crosshair                                */
/* ------------------------------------------------------------------ */

export interface SeriesSpec {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export function LineChart({
  labels,
  series,
  height = 190,
  yLabel,
}: {
  labels: string[];
  series: SeriesSpec[];
  height?: number;
  yLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const W = 720;
  const H = height;
  const pad = { t: 12, r: 14, b: 24, l: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];

  const x = (i: number) =>
    pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / top) * ih;

  function onMove(e: React.MouseEvent) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - pad.l) / iw) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  }

  return (
    <div>
      <Legend series={series} />
      <div
        ref={wrap}
        className="relative mt-3"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${series.map((s) => s.label).join(" and ")} over ${labels.length} days`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? AXIS : GRID}
                strokeWidth="1"
              />
              <text
                x={pad.l - 7}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize="9.5"
                fill={MUTED}
                className="tnum"
              >
                {t}
              </text>
            </g>
          ))}

          {series.map((s) => (
            <g key={s.key}>
              <path
                d={`${areaPath(s.values, x, y)} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                fill={s.color}
                opacity="0.1"
              />
              <path
                d={linePath(s.values, x, y)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}

          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={pad.t + ih}
                stroke="color-mix(in oklab, var(--brand-black) 12%, transparent)"
                strokeWidth="1"
              />
              {series.map((s) => (
                <circle
                  key={s.key}
                  cx={x(hover)}
                  cy={y(s.values[hover] ?? 0)}
                  r="4.5"
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              ))}
            </>
          )}

          {[0, Math.floor(labels.length / 2), labels.length - 1].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
              fontSize="9.5"
              fill={MUTED}
            >
              {labels[i]}
            </text>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[132px] rounded-lg border border-brand-black/[0.12] bg-secondary px-2.5 py-2 text-xs shadow-xl"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform:
                hover > labels.length / 2 ? "translateX(-108%)" : "translateX(8%)",
            }}
          >
            <div className="mb-1.5 text-[11px] text-brand-black/55">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 py-px">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: s.color }}
                />
                <span className="text-brand-black/70">{s.label}</span>
                <span className="tnum ml-auto font-medium text-brand-black">
                  {s.values[hover]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {yLabel && <div className="mt-1 text-[11px] text-brand-black/40">{yLabel}</div>}
    </div>
  );
}

function linePath(
  values: number[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

function areaPath(
  values: number[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  return linePath(values, x, y);
}

function niceTicks(max: number, count: number): number[] {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw)! * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  return out;
}

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-brand-black/70">
          <span
            className="size-2 rounded-[2px]"
            style={{ background: s.color }}
            aria-hidden
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar chart — single hue, direct labels                    */
/* ------------------------------------------------------------------ */

export function BarRows({
  rows,
  color = "var(--color-s1)",
  max: maxOverride,
}: {
  rows: { label: string; value: number; hint?: string }[];
  color?: string;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="group flex items-center gap-3" title={r.hint}>
          <span className="w-28 shrink-0 truncate text-xs text-brand-black/70">{r.label}</span>
          <span className="relative h-[9px] min-w-0 flex-1 overflow-hidden rounded-full bg-brand-black/[0.06]">
            <span
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                background: color,
              }}
            />
          </span>
          <span className="tnum w-9 shrink-0 text-right text-xs font-medium text-brand-black">
            {r.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented status bar — reserved status colours, 2px surface gaps    */
/* ------------------------------------------------------------------ */

export function SegmentBar({
  segments,
  height = 10,
}: {
  segments: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const shown = segments.filter((s) => s.value > 0);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-brand-black/[0.06]"
        style={{ height, gap: 2 }}
        onMouseLeave={() => setHover(null)}
      >
        {shown.map((s) => (
          <span
            key={s.label}
            title={`${s.label}: ${s.value}`}
            onMouseEnter={() => setHover(s.label)}
            className="h-full rounded-full transition-opacity"
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color,
              opacity: hover && hover !== s.label ? 0.4 : 1,
            }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {shown.map((s) => (
          <li
            key={s.label}
            onMouseEnter={() => setHover(s.label)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center gap-1.5 text-[11px] text-brand-black/70"
          >
            <span
              className="size-2 rounded-[2px]"
              style={{ background: s.color }}
              aria-hidden
            />
            {s.label}
            <span className="tnum font-medium text-brand-black">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline — one series, so no legend; the caption names it          */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  color = "var(--color-s1)",
  height = 40,
  suffix = "",
}: {
  values: number[];
  color?: string;
  height?: number;
  suffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 240;
  const H = height;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);

  const stats = useMemo(() => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
    };
  }, [values]);

  return (
    <div>
      <div
        className="relative"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (values.length - 1));
          setHover(Math.max(0, Math.min(values.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Stretch to the container width; non-scaling-stroke keeps the
            line 2px despite the non-uniform scale. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          aria-hidden
        >
          <path
            d={`${linePath(values, x, y)} L${W},${H} L0,${H} Z`}
            fill={color}
            opacity="0.1"
          />
          <path
            d={linePath(values, x, y)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <circle
              cx={x(hover)}
              cy={y(values[hover])}
              r="4"
              fill={color}
              stroke="var(--card)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-1 rounded border border-brand-black/[0.12] bg-secondary px-1.5 py-0.5 text-[11px] text-brand-black tnum"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: hover > values.length / 2 ? "translateX(-110%)" : "translateX(10%)",
            }}
          >
            {values[hover]}
            {suffix}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-4 text-[11px] text-brand-black/55">
        <span>
          p50 <span className="tnum font-medium text-brand-black/70">{stats.p50}{suffix}</span>
        </span>
        <span>
          p95 <span className="tnum font-medium text-brand-black/70">{stats.p95}{suffix}</span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Similarity meter — a magnitude, shown as one bar                    */
/* ------------------------------------------------------------------ */

export function SimilarityMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2" title={`Similarity ${value.toFixed(3)}`}>
      <span className="relative h-1 w-12 overflow-hidden rounded-full bg-brand-black/[0.06]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: "var(--color-s1)" }}
        />
      </span>
      <span className="tnum text-[11px] font-medium text-brand-black/70">
        {value.toFixed(2)}
      </span>
    </span>
  );
}
