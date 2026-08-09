import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, wantsRemote } from "@/lib/remote";
import { clearTagCache } from "@/lib/tags";
import { resetDb, stats } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /v3/settings/reset — destructive on a real instance: removes all
 * documents, memories and spaces. The mock requires the same explicit
 * confirmation so the UI's confirm flow is exercised end to end.
 */
export async function POST(req: Request) {
  const b = await body<{ confirm?: string }>(req);
  if (b.confirm !== "RESET")
    return fail(400, 'Send { "confirm": "RESET" } to proceed.', "confirmation_required");

  if (wantsRemote(req)) {
    const { status, data, ok: success } = await proxyJson<{
      reset?: boolean;
      removed?: { documents: number; memories: number };
    }>("/v3/settings/reset", {
      method: "POST",
      json: { confirm: "RESET" },
    });
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? "Reset failed",
      );
    }
    clearTagCache();
    return ok(data);
  }

  await delay(500);
  const before = stats();
  resetDb();
  return ok({
    reset: true,
    removed: { documents: before.documents, memories: before.memories },
    note: "Mock reset restores the seeded corpus. A real instance would leave the org empty.",
  });
}
