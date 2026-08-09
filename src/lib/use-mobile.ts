"use client";

import * as React from "react";

/** Matches Tailwind's `md` breakpoint — below it the shell goes single-column. */
export const MOBILE_QUERY = "(max-width: 767px)";

/**
 * `true` while the viewport is narrower than `md`.
 *
 * Starts `false` so server and first client render agree; the layout itself is
 * driven by media queries, so this hook only decides behaviour (which sidebar
 * state a toggle flips, whether the scrim is live) rather than what paints.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isMobile;
}
