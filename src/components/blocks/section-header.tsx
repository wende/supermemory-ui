"use client";

/**
 * SectionHeader — eyebrow label + h2 title for showcase pages.
 */
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-1", className)}>
      {eyebrow && (
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
          {eyebrow}
        </div>
      )}
      <h2 className="text-[20px] font-semibold tracking-tight text-brand-black">
        {title}
      </h2>
      {description && (
        <p className="text-[12px] text-brand-black/55">{description}</p>
      )}
    </div>
  );
}
