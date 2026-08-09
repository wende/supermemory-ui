"use client";

/**
 * EmptyState — centered empty placeholder with icon and copy.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "slide-up flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-black/[0.035]">
          <Icon className="size-5 text-brand-black/45" />
        </div>
      )}
      <div>
        <p className="text-[13px] font-medium text-brand-black">{title}</p>
        {description && (
          <p className="mt-1 text-[12px] text-brand-black/45">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
