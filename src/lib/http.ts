import { NextResponse } from "next/server";

/** Every mock route is request-time; nothing here is prerenderable. */
export const dynamicRoute = "force-dynamic";

export function ok<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function fail(status: number, message: string, code?: string) {
  return NextResponse.json({ error: message, code: code ?? "error" }, { status });
}

export async function body<T = Record<string, unknown>>(
  req: Request,
): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Simulate the latency of a local binary so loading states are visible. */
export function delay(ms = 90) {
  return new Promise((r) => setTimeout(r, ms));
}
