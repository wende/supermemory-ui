"use client";

import { cn } from "@/lib/utils";

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  hint?: string;
  className?: string;
  id?: string;
};

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  hint,
  className,
  id,
}: SliderProps) {
  return (
    <label className={cn("block py-1.5", className)}>
      {(label || hint) && (
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && (
            <span className="text-sm text-brand-black">{label}</span>
          )}
          {hint && (
            <span className="text-[11px] text-brand-black/45 tnum">{hint}</span>
          )}
        </span>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full",
          "bg-brand-black/[0.08] accent-brand-black",
          "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-black",
          "[&::-webkit-slider-thumb]:shadow-sm",
          "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand-black",
        )}
      />
    </label>
  );
}
