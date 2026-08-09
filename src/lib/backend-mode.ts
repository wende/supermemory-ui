/** Client-side backend preference (mock vs live). Synced via cookie for API routes. */

export type BackendMode = "mock" | "remote";

const COOKIE = "sm_backend";

export function getBackendPreference(): BackendMode {
  if (typeof document === "undefined") return "remote";
  const match = document.cookie.match(
    /(?:^|;\s*)sm_backend=(mock|remote)(?:;|$)/,
  );
  return match?.[1] === "mock" ? "mock" : "remote";
}

export function setBackendPreference(mode: BackendMode) {
  document.cookie = `${COOKIE}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
}
