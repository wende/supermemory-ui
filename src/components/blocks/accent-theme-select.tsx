"use client";

/**
 * AccentThemeSelect — swaps html[data-accent] between registered accent packs.
 * Surfaces (light/dark) stay independent via ThemeToggle.
 */
import * as React from "react";
import {
  ACCENT_THEMES,
  ACCENT_THEME_IDS,
  DEFAULT_ACCENT_THEME,
  applyAccentTheme,
  readStoredAccentTheme,
  type AccentThemeId,
} from "@/lib/accent-theme";
import { cn } from "@/lib/utils";

export function AccentThemeSelect({ className }: { className?: string }) {
  const [accent, setAccent] = React.useState<AccentThemeId>(DEFAULT_ACCENT_THEME);

  React.useEffect(() => {
    const current = readStoredAccentTheme();
    // Don't rewrite localStorage on mount — the pre-paint layout script already
    // set data-accent. Only sync the dataset (and storage) if they drifted.
    if (document.documentElement.dataset.accent !== current) {
      applyAccentTheme(current);
    }
    setAccent(current);
  }, []);

  function onChange(next: AccentThemeId) {
    setAccent(next);
    applyAccentTheme(next);
  }

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-1 text-[11px] font-medium text-brand-black/55 sm:items-end",
        className,
      )}
    >
      {/* The sr-only span is the select's only accessible name — the visible
          "Accent theme" heading lives outside this component, so it can't be
          wired up with htmlFor. */}
      <label className="inline-flex items-center gap-1.5">
        <span className="sr-only">Accent theme</span>
        <select
          value={accent}
          onChange={(e) => onChange(e.target.value as AccentThemeId)}
          className="h-9 max-w-[9rem] cursor-pointer rounded-lg border border-brand-black/[0.08] bg-transparent px-2 text-[16px] font-semibold tracking-tight text-brand-black outline-none transition-colors hover:bg-brand-black/[0.04] focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:max-w-[7.5rem] sm:text-[11px]"
        >
          {ACCENT_THEME_IDS.map((id) => (
            <option key={id} value={id}>
              {ACCENT_THEMES[id].label}
            </option>
          ))}
        </select>
      </label>
      {/* Rendered inline rather than as title= — a hover tooltip is hard to
          discover and never showed up on touch. */}
      <p className="max-w-[13rem] text-[11px] leading-relaxed text-brand-black/40 sm:text-right">
        {ACCENT_THEMES[accent].description}
      </p>
    </div>
  );
}
