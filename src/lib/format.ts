import type { DocumentStatus, DocumentType } from "./types";

export function relTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: [number, string][] = [
    [31_536_000_000, "y"],
    [2_592_000_000, "mo"],
    [604_800_000, "w"],
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      return future ? `in ${n}${label}` : `${n}${label} ago`;
    }
  }
  return "just now";
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Document type → single-glyph mark. Never the only signal; always paired with a label. */
export const TYPE_GLYPH: Record<DocumentType, string> = {
  text: "¶",
  pdf: "▤",
  tweet: "❞",
  google_doc: "▤",
  google_slide: "▭",
  google_sheet: "▦",
  image: "◫",
  video: "▶",
  audio: "◊",
  notion_doc: "◈",
  webpage: "⌾",
  onedrive: "☁",
  github_markdown: "‹›",
  granola: "◉",
};

export const TYPE_LABEL: Record<DocumentType, string> = {
  text: "Text",
  pdf: "PDF",
  tweet: "Post",
  google_doc: "Google Doc",
  google_slide: "Slides",
  google_sheet: "Sheet",
  image: "Image",
  video: "Video",
  audio: "Audio",
  notion_doc: "Notion",
  webpage: "Web page",
  onedrive: "OneDrive",
  github_markdown: "Markdown",
  granola: "Granola",
};

/** Status colour uses the reserved status palette, never a series colour. */
export const STATUS_COLOR: Record<DocumentStatus, string> = {
  unknown: "color-mix(in oklab, var(--brand-black) 55%, transparent)",
  queued: "color-mix(in oklab, var(--brand-black) 55%, transparent)",
  extracting: "var(--warning-status)",
  chunking: "var(--warning-status)",
  embedding: "var(--warning-status)",
  indexing: "var(--warning-status)",
  done: "var(--color-good)",
  failed: "var(--color-critical)",
};

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  unknown: "Unknown",
  queued: "Queued",
  extracting: "Extracting",
  chunking: "Chunking",
  embedding: "Embedding",
  indexing: "Indexing",
  done: "Indexed",
  failed: "Failed",
};

/**
 * Auto-ingest spaces are stored as `Space ${containerTag}`. Drop that prefix
 * for operator-facing labels; keep intentional custom names as-is.
 */
export function spaceDisplayName(name: string, containerTag: string): string {
  if (name === `Space ${containerTag}`) return containerTag;
  return name;
}
