"use client";

/**
 * PageTransition — wraps a route's children with the standard mount
 * animation. Both `/` and `/example` (and any future route) use this so
 * navigation feels consistent.
 *
 * The animation is `animate-fade-in` (defined in `globals.css`):
 *
 *   @keyframes fadeIn {
 *     from { opacity: 0; transform: translateY(6px); }
 *     to   { opacity: 1; transform: translateY(0); }
 *   }
 *
 * Because each route lives in its own Server Component file, navigating
 * between them unmounts the old page and mounts the new one — the mount
 * fires the keyframe. No client-side router needed.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-fade-in", className)}>{children}</div>
  );
}
