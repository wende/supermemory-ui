"use client";

import { cn } from "@/lib/utils";

export function FilterPill({
  label,
  count,
  accent,
  active,
  onClick,
  title,
  className,
}: {
  label: string;
  count?: number;
  accent?: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors",
        active
          ? "bg-brand-black text-background"
          : "text-brand-black/55 hover:bg-brand-black/[0.03] hover:text-brand-black/82",
        className,
      )}
    >
      {accent && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: accent }}
        />
      )}
      {label}
      {count !== undefined && (
        <span className={cn("tnum", active ? "opacity-60" : "text-brand-black/35")}>
          {count}
        </span>
      )}
    </button>
  );
}
