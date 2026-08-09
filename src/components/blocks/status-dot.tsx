"use client";

/**
 * StatusDot — the 6–8px colored dot used as the visual marker for status.
 *
 * Variants use the brand palette:
 *   success  → brand-success
 *   running  → brand-ongoing
 *   failure  → brand-failure
 *   paused   → brand-paused
 *   pending  → muted-foreground
 *   neutral  → brand-black at 18%
 *   live     → brand-black
 */
import { cn } from "@/lib/utils";

type Tone =
  | "success"
  | "running"
  | "failure"
  | "paused"
  | "pending"
  | "neutral"
  | "live"
  | "building";

const toneClass: Record<Tone, string> = {
  success: "bg-brand-success-bg",
  running: "bg-brand-ongoing",
  failure: "bg-brand-failure",
  paused: "bg-brand-paused-bg",
  pending: "bg-muted-foreground/30",
  neutral: "bg-brand-black/18",
  live: "bg-brand-black",
  building: "bg-brand-black/50",
};

export function StatusDot({
  tone,
  pulsing = false,
  className,
}: {
  tone: Tone;
  pulsing?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        toneClass[tone],
        pulsing && "animate-soft-pulse",
        className,
      )}
    />
  );
}
