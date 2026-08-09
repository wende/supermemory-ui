"use client";

/**
 * StatusPill — the small uppercase pill chip used for environment tags.
 *
 * Variants:
 *   solid   — bg foreground, text background   (Healthy, live, Active)
 *   muted   — bg brand-black/[0.05], text 55   (Offline, test)
 *   soft    — bg brand-black/[0.035], text 55  (dev)
 *   success — bg brand-success-bg, text dark   (success states)
 *   ongoing — bg brand-ongoing, text dark      (running)
 *   failure — bg brand-failure, text dark      (failure)
 *   paused  — bg brand-paused-bg, text dark    (paused, pending)
 */
import { cn } from "@/lib/utils";

type Variant =
  | "solid"
  | "muted"
  | "soft"
  | "success"
  | "ongoing"
  | "failure"
  | "paused";

const variantClass: Record<Variant, string> = {
  solid: "bg-foreground text-background",
  muted: "bg-brand-black/[0.05] text-brand-black/55",
  soft: "bg-brand-black/[0.035] text-brand-black/55",
  success: "bg-brand-success-bg text-brand-success-text",
  ongoing: "bg-brand-ongoing text-brand-ongoing-text",
  failure: "bg-brand-failure text-brand-failure-text",
  paused: "bg-brand-paused-bg text-brand-paused-text",
};

interface StatusPillProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

export function StatusPill({
  children,
  variant = "muted",
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        // py-1.5 + text-[11px] gives the pill a proper chip feel — the
        // original py-1/text-[10px] was tight against the glyphs and
        // looked anemic in the panel layouts.
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] leading-none",
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
