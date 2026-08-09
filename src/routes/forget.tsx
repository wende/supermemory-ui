"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Button,
  Input,
  Select,
  Spinner,
  Textarea,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import { invalidateCorpus, prefetch, useSpaces } from "@/lib/queries";
import { spaceName } from "@/lib/timeline";
import type { MemoryEntry } from "@/lib/types";

export function warm(): void {
  void prefetch.spaces();
}

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export default function ForgetPage() {
  const { push, view: toasts } = useToasts();
  const { spaces } = useSpaces();
  // Empty string = all spaces (live API is per-tag; the route fans out).
  const [space, setSpace] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<MemoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedSpaces = useMemo(
    () => [...spaces].sort((a, b) => a.containerTag.localeCompare(b.containerTag)),
    [spaces],
  );

  // If the selected tag disappears on refetch, fall back to All spaces and
  // drop the preview so Apply can't silently widen to every space.
  useEffect(() => {
    if (!space) return;
    if (!sortedSpaces.some((s) => s.containerTag === space)) {
      setSpace("");
      setPreview(null);
    }
  }, [sortedSpaces, space]);

  const showSpaceOnRows = !space && (preview?.length ?? 0) > 0;

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-5">
        <PageTitle
          label="Ingest"
          title="Forget"
          description="Describe what should no longer be believed — always preview before committing."
        />

        <div className="min-w-0 sm:w-[220px]">
          <label className="label mb-2 block">Space</label>
          <Select
            value={space}
            onChange={(e) => {
              setSpace(e.target.value);
              setPreview(null);
            }}
            aria-label="Space"
            className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none"
          >
            <option value="">All spaces</option>
            {sortedSpaces.map((s) => (
              <option key={s.containerTag} value={s.containerTag}>
                {spaceName(sortedSpaces, s.containerTag)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="label mb-2 block">Forget prompt</label>
          <Textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setPreview(null);
            }}
            rows={4}
            placeholder="e.g. anything about my old apartment address"
          />
        </div>

        <div>
          <label className="label mb-2 block">Reason (stored on each entry)</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Moved last spring — no longer relevant"
            className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy || !prompt.trim()}
            className="rounded-full"
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api.forgetMatching({
                  prompt: prompt.trim(),
                  containerTag: space || undefined,
                  dryRun: true,
                });
                setPreview(res.memories);
              } catch (e) {
                push(
                  errMessage(e, "Failed to forget matching memories"),
                  "critical",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />}
            Preview matches
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || !preview?.length}
            onClick={async () => {
              if (!preview?.length) return;
              setBusy(true);
              try {
                // Bound the delete to the previewed set — re-running the
                // prompt can drift if the corpus changed in between.
                const res = await api.forgetMatching({
                  ids: preview.map((m) => m.id),
                  containerTag: space || undefined,
                  reason: reason.trim() || undefined,
                });
                push(
                  `Forgot ${res.count} ${res.count === 1 ? "memory" : "memories"}`,
                  "neutral",
                );
                setPreview(null);
                setPrompt("");
                setReason("");
                invalidateCorpus();
              } catch (e) {
                push(
                  errMessage(e, "Failed to forget matching memories"),
                  "critical",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon.forget size={14} />
            Forget {preview?.length ?? 0}
          </Button>
        </div>

        {preview && (
          <div>
            <h3 className="label mb-2.5">
              {preview.length} would be forgotten
              {!space ? " across all spaces" : ""}
            </h3>
            {preview.length === 0 ? (
              <p className="text-xs text-brand-black/55">
                Nothing matched. Try broader wording.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {preview.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-brand-black/[0.06] bg-muted px-2.5 py-2 text-xs leading-relaxed text-brand-black/55"
                  >
                    {showSpaceOnRows && (
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-brand-black/40">
                        {spaceName(sortedSpaces, m.spaceId)}
                      </span>
                    )}
                    {m.memory}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </PageBody>

      {toasts}
    </>
  );
}
