import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { passthrough, proxy, wantsRemote } from "@/lib/remote";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Catch-all proxy for live endpoints that have no dedicated handler
 * (API explorer paths marked mocked: false). In mock mode these stay 404
 * so the explorer still reflects what's actually implemented locally.
 */
async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  const suffix = path.join("/");

  if (!wantsRemote(req)) {
    return fail(
      404,
      `No mock handler for /${suffix}. Set SUPERMEMORY_URL to proxy to a live instance.`,
      "not_found",
    );
  }

  const url = new URL(req.url);
  const target = `/${suffix}${url.search}`;

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const buf = await req.arrayBuffer();
    if (buf.byteLength) init.body = buf;
  }

  try {
    const res = await proxy(target, init);
    // Awaited so a passthrough failure lands in the catch below rather than
    // rejecting out of the handler as an unhandled 500.
    return await passthrough(res);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Proxy failed" },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
