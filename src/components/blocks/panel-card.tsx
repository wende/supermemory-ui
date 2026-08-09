"use client";

/**
 * PanelCard — the 28px-rounded white card with eyebrow + title + optional actions.
 * The signature "panel" surface used across 8claw dashboards.
 *
 * Stagger-children is opt-in via `stagger` so list panels animate children in.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

interface PanelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  stagger?: boolean;
}

export function PanelCard({
  eyebrow,
  title,
  subtitle,
  action,
  stagger = false,
  className,
  children,
  ...props
}: PanelCardProps) {
  return (
    <div
      className={cn(
        "animate-fade-in overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]",
        className,
      )}
      {...props}
    >
      {(eyebrow || title || action) && (
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            {eyebrow && (
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
                {eyebrow}
              </div>
            )}
            {title && (
              <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-[11px] text-brand-black/45">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div
        className={cn(
          (eyebrow || title) && "border-t border-brand-black/[0.05]",
          stagger && "stagger-children",
          // Give the last child some breathing room from the rounded
          // bottom edge, even when consumers don't add their own padding.
          (eyebrow || title) && "pb-3",
        )}
      >
        {children}
      </div>
    </div>
  );
}
