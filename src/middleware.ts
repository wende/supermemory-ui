import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BACKEND_COOKIE } from "@/lib/remote";

/**
 * `?mock` / `?mock=1` → force bundled mock data
 * `?mock=0` / `?remote` → use live instance when configured
 *
 * Sets the sm_backend cookie then redirects to the same path without the flag,
 * so the preference sticks across navigations.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
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
     * Run on page navigations; skip static assets and the pure API
     * surface (API reads the cookie set here / from Settings).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
