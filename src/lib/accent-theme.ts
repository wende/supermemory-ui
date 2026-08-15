/**
 * Accent theme registry — chromatic palettes swapped via
 * document.documentElement.dataset.accent.
 *
 * Surfaces (background, border, sidebar, …) are independent and stay in
 * globals.css light/dark. Add a theme by:
 *   1. Adding a [data-accent="…"] block in src/styles/accent-themes.css
 *   2. Registering it here
 */

export const ACCENT_STORAGE_KEY = "supermemory-accent";

export const ACCENT_THEMES = {
  "te-orange": {
    id: "te-orange",
    label: "TE Orange",
    description: "High-contrast orange, cyan, and magenta accents",
  },
} as const;

export type AccentThemeId = keyof typeof ACCENT_THEMES;

export const DEFAULT_ACCENT_THEME: AccentThemeId = "te-orange";

export const ACCENT_THEME_IDS = Object.keys(ACCENT_THEMES) as AccentThemeId[];

function isAccentThemeId(value: string | null | undefined): value is AccentThemeId {
  // hasOwnProperty, not `in` — `in` also matches prototype keys ("toString",
  // "constructor", …), so a corrupted localStorage value could pass the guard
  // and end up on <html data-accent> with no matching CSS block.
  return !!value && Object.prototype.hasOwnProperty.call(ACCENT_THEMES, value);
}

export function readStoredAccentTheme(): AccentThemeId {
  if (typeof window === "undefined") return DEFAULT_ACCENT_THEME;
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccentThemeId(stored) ? stored : DEFAULT_ACCENT_THEME;
  } catch {
    return DEFAULT_ACCENT_THEME;
  }
}

export function applyAccentTheme(id: AccentThemeId) {
  document.documentElement.dataset.accent = id;
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}
