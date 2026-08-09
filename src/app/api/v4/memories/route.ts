import { body, delay, fail, ok } from "@/lib/http";
import { proxyJson, remoteErrorMessage, wantsRemote } from "@/lib/remote";
import { pickTag } from "@/lib/tags";
import { createMemory, forgetMemory, restoreMemory, updateMemory } from "@/lib/store";
import type { MemoryEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /v4/memories — create a memory directly, bypassing ingestion. */
export async function POST(req: Request) {
  const b = await body<{
    memory?: string;
    containerTag?: string;
    isStatic?: boolean;
    metadata?: Record<string, string | number | boolean | null>;
  }>(req);
  if (!b.memory?.trim()) return fail(400, "`memory` is required.");

  if (wantsRemote(req)) {
    const tag = await pickTag(b.containerTag);
    const { status, data, ok: success } = await proxyJson<{
      documentId?: string;
      memories?: MemoryEntry[];
    }>("/v4/memories", {
      method: "POST",
      json: {
        containerTag: tag,
        memories: [
          {
            content: b.memory.trim(),
            isStatic: b.isStatic ?? true,
            metadata: b.metadata ?? null,
          },
        ],
      },
    });
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? "Create memory failed",
      );
    }
    const entry = data.memories?.[0];
    if (entry) {
      return ok(
        {
          ...entry,
          spaceId:
            (entry as MemoryEntry).spaceId ||
            tag,
          memory: (entry as MemoryEntry).memory || b.memory.trim(),
        },
        { status: 201 },
      );
    }
    // Fallback synthetic entry if live returns only documentId.
    const now = new Date().toISOString();
    return ok(
      {
        id: data.documentId ?? "unknown",
        memory: b.memory.trim(),
        version: 1,
        isLatest: true,
        isForgotten: false,
        isStatic: b.isStatic ?? true,
        isInference: false,
        createdAt: now,
        updatedAt: now,
        spaceId: tag,
        orgId: "remote",
        sourceCount: 0,
        parentMemoryId: null,
        rootMemoryId: data.documentId ?? null,
        forgetAfter: null,
        forgetReason: null,
        metadata: b.metadata ?? null,
        memoryRelations: null,
        temporalContext: null,
        history: [],
        documentIds: data.documentId ? [data.documentId] : [],
      } satisfies MemoryEntry,
      { status: 201 },
    );
  }

  await delay(140);
  return ok(createMemory({ ...b, memory: b.memory.trim() }), { status: 201 });
}

/** PATCH /v4/memories — an edit always creates a new version. */
export async function PATCH(req: Request) {
  const b = await body<{ id?: string; memory?: string; restore?: boolean }>(req);
  if (!b.id) return fail(400, "`id` is required.");

  if (wantsRemote(req)) {
    const payload: Record<string, unknown> = { id: b.id };
    if (b.restore) payload.restore = true;
    else {
      if (!b.memory?.trim()) return fail(400, "`memory` is required.");
      payload.memory = b.memory.trim();
    }
    const { status, data, ok: success } = await proxyJson<MemoryEntry>(
      "/v4/memories",
      { method: "PATCH", json: payload },
    );
    if (!success) {
      return fail(
        status,
        (data as { error?: string })?.error ?? "Update memory failed",
      );
    }
    return ok(data);
  }

  if (b.restore) {
    const restored = restoreMemory(b.id);
    return restored ? ok(restored) : fail(404, `No memory "${b.id}".`, "not_found");
  }

  if (!b.memory?.trim()) return fail(400, "`memory` is required.");
  await delay(120);
  const updated = updateMemory(b.id, b.memory.trim());
  return updated ? ok(updated) : fail(404, `No memory "${b.id}".`, "not_found");
}

/** DELETE /v4/memories — forget, which retains the entry and its edges. */
export async function DELETE(req: Request) {
  const b = await body<{ id?: string; reason?: string; containerTag?: string }>(req);
  if (!b.id) return fail(400, "`id` is required.");
  const reason = b.reason?.trim() || undefined;

  if (wantsRemote(req)) {
    try {
      const tag = await pickTag(b.containerTag);
      const { status, data, ok: success } = await proxyJson<{
        id: string;
        forgotten: boolean;
      }>("/v4/memories", {
        method: "DELETE",
        json: { id: b.id, reason, containerTag: tag },
      });
      if (!success) {
        return fail(
          status,
          remoteErrorMessage(data, "Forget memory failed"),
        );
      }
      const now = new Date().toISOString();
      return ok({
        id: data.id ?? b.id,
        memory: "",
        version: 1,
        isLatest: true,
        isForgotten: data.forgotten ?? true,
        isStatic: false,
        isInference: null,
        createdAt: now,
        updatedAt: now,
        spaceId: tag,
        orgId: "remote",
        sourceCount: 0,
        parentMemoryId: null,
        rootMemoryId: data.id ?? b.id,
        forgetAfter: null,
        forgetReason: reason ?? null,
        metadata: null,
        memoryRelations: null,
        temporalContext: null,
        history: [],
        documentIds: [],
      } satisfies MemoryEntry);
    } catch (e) {
      return fail(
        502,
        e instanceof Error ? e.message : "Forget memory failed",
      );
    }
  }

  const forgotten = forgetMemory(b.id, reason);
  return forgotten ? ok(forgotten) : fail(404, `No memory "${b.id}".`, "not_found");
}
