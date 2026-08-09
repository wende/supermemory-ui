import { delay, ok } from "@/lib/http";
import { passthrough, proxy, wantsRemote } from "@/lib/remote";
import { suggestBuckets } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (wantsRemote(req)) {
    const res = await proxy("/v3/settings/suggest-buckets", { method: "POST" });
    return passthrough(res);
  }
  await delay(600);
  return ok({ buckets: suggestBuckets() });
}
