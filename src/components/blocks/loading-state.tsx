"use client";

/**
 * LoadingState — centered spinner with optional label.
 */
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = "Loading...", className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-6 py-4 text-[12px] text-brand-black/55",
        className,
      )}
    >
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}
