"use client";

/**
 * StatsCard — the headline metric card.
 *
 * Layout: uppercase eyebrow label | status pill in the top-right,
 *         3xl metric, two lines of supporting text below.
 */
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/blocks/status-pill";

interface StatsCardProps {
  label: string;
  metric: string;
  primary?: string;
  secondary?: string;
  healthy?: boolean;
  className?: string;
}

export function StatsCard({
  label,
  metric,
  primary,
  secondary,
  healthy,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-[26px] border border-brand-black/[0.06] bg-card px-5 py-5",
        "shadow-[0_18px_45px_rgba(17,17,17,0.05)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/40">
          {label}
        </span>
        {healthy !== undefined && (
          <StatusPill variant={healthy ? "solid" : "muted"}>
            {healthy ? "Healthy" : "Offline"}
          </StatusPill>
        )}
      </div>
      <div className="mt-3">
        <span className="text-3xl font-semibold tracking-tight text-brand-black">
          {metric}
        </span>
      </div>
      {primary && (
        <p className="mt-2 truncate text-[11px] text-brand-black/45">{primary}</p>
      )}
      {secondary && (
        <p className="mt-1 truncate text-[11px] text-brand-black/55">{secondary}</p>
      )}
    </div>
  );
}
