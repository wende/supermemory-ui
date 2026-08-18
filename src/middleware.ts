import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BACKEND_COOKIE } from "@/lib/remote";

/** Methods that can change state, and so are worth a cross-site check. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Reject cross-site writes to `/api/*`.
 *
 * The route handlers read their bodies with `req.json()`, which does not look
 * at Content-Type, so a plain `<form enctype="text/plain">` on a hostile page
 * can post a body that parses as JSON. Forms are not preflighted, and the
 * proxy attaches SUPERMEMORY_KEY server-side, so without this check any page
 * the operator visits while the console is running could reach a destructive
 * endpoint — `/api/v3/settings/reset` or `/api/v4/memories/forget-matching`
 * — with the operator's own credentials.
 *
 * `Sec-Fetch-Site` is sent by every browser that can mount the attack, so it
 * is the primary signal; `Origin` covers the rest. A request carrying neither
 * did not come from a browser (curl, a script, a server) and is left alone —
 * those callers have no ambient credentials to forge.
 */
function blockedAsCrossSite(req: NextRequest): boolean {
  if (!MUTATING.has(req.method)) return false;

  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "cross-site";

  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

/**
 * `?mock` / `?mock=1` → force bundled mock data
 * `?mock=0` / `?remote` → use live instance when configured
 *
 * Sets the sm_backend cookie then redirects to the same path without the flag,
 * so the preference sticks across navigations.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // The API surface only needs the cross-site guard; it reads the backend
  // preference from the cookie set on page navigations below.
  if (url.pathname.startsWith("/api/")) {
    return blockedAsCrossSite(req)
      ? NextResponse.json(
          { error: "Cross-site request blocked.", code: "cross_site_blocked" },
          { status: 403 },
        )
      : NextResponse.next();
  }

  const mock = url.searchParams.get("mock");
  const remote = url.searchParams.has("remote");

  if (mock === null && !remote) return NextResponse.next();

  const mode =
    remote || mock === "0" || mock === "false"
      ? "remote"
      : "mock"; // bare ?mock, ?mock=1, ?mock=true

  url.searchParams.delete("mock");
  url.searchParams.delete("remote");

  const res = NextResponse.redirect(url);
  res.cookies.set(BACKEND_COOKIE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: [
    /*
     * Page navigations (for the ?mock / ?remote flags) plus the API surface
     * (for the cross-site write guard); static assets are skipped.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
