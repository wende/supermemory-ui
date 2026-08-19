"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouteParams } from "@/components/route-host";
import { BarRows } from "@/components/charts";
import { Icon } from "@/components/icons";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Drawer,
  SectionHeader,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  Toggle,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import { invalidateCorpus, prefetch, useSpaces } from "@/lib/queries";
import { relTime, shortDate } from "@/lib/format";
import type { ContainerTag, MergeStatus } from "@/lib/types";

export function warm(): void {
  void prefetch.spaces();
}

export default function SpacesView() {
  const params = useRouteParams();
  const { push, view: toasts } = useToasts();
  const { spaces, merges, isLoading: loading } = useSpaces();
  const tagParam = params.get("tag");
  const [openTag, setOpenTag] = useState<string | null>(tagParam);
  const [mergeOpen, setMergeOpen] = useState(false);

  // The tab stays mounted, so a later `/spaces?tag=` visit has to reopen the
  // drawer even though useState already ran on the first mount.
  useEffect(() => {
    if (tagParam !== null) setOpenTag(tagParam);
  }, [tagParam]);

  const maxDocs = Math.max(1, ...spaces.map((s) => s.documentCount));
  const open = spaces.find((s) => s.containerTag === openTag) ?? null;

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-5">
        <PageTitle
          label="Ingest"
          title="Spaces"
          description="Container tags that partition ingest, recall, and profiles together."
        >
          <Button
            size="sm"
            onClick={() => setMergeOpen(true)}
            disabled={spaces.length < 2}
            className="rounded-full"
          >
            <Icon.space size={14} />
            Merge tags
          </Button>
        </PageTitle>

        {loading && !spaces.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <Card>
              <SectionHeader title="Distribution" meta={`${spaces.length} spaces`} />
              <div className="px-5 py-4">
                <BarRows
                  rows={spaces.map((s) => ({
                    label: s.name,
                    value: s.memoryCount,
                    hint: `${s.memoryCount} memories, ${s.documentCount} documents`,
                  }))}
                  color="var(--color-s3)"
                />
                <p className="mt-3 border-t border-brand-black/[0.06] pt-3 text-[11px] text-brand-black/40">
                  Memories per space. Documents range up to {maxDocs} per space.
                </p>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {spaces.map((s) => (
                <Card key={s.containerTag} className="flex flex-col">
                  <div className="flex-1 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-brand-black">{s.name}</h3>
                        <Copyable value={s.containerTag} className="mt-1 text-brand-black/40" />
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-brand-black/55">
                      {s.description}
                    </p>

                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-brand-black/[0.06] pt-3.5">
                      <Metric label="Memories" value={s.memoryCount} />
                      <Metric label="Documents" value={s.documentCount} />
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-brand-black/[0.06] px-5 py-3">
                    <Button size="sm" onClick={() => setOpenTag(s.containerTag)}>
                      <Icon.settings size={13} />
                      Configure
                    </Button>
                    <Link href={`/memories?space=${s.containerTag}`}>
                      <Button size="sm" variant="ghost">
                        Memories
                      </Button>
                    </Link>
                    <Link href={`/graph?space=${s.containerTag}`}>
                      <Button size="sm" variant="ghost">
                        Graph
                      </Button>
                    </Link>
                    <span className="ml-auto text-[11px] text-brand-black/40">
                      {relTime(s.updatedAt)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            {merges.length > 0 && (
              <Card>
                <SectionHeader title="Recent merges" />
                <ul className="divide-y divide-brand-black/[0.05]">
                  {merges.map((m) => (
                    <li
                      key={m.mergeId}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 text-xs"
                    >
                      <Badge tone={m.status === "done" ? "good" : "warning"}>
                        {m.status}
                      </Badge>
                      <span className="mono text-brand-black/55">
                        {m.source} → {m.target}
                      </span>
                      <span className="text-brand-black/40">
                        moved {m.movedDocuments} docs, {m.movedMemories} memories
                      </span>
                      <span className="ml-auto text-brand-black/40">
                        {shortDate(m.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </PageBody>

      <SpaceDrawer
        space={open}
        onClose={() => setOpenTag(null)}
        onSaved={() => {
          push("Space settings updated", "good");
          invalidateCorpus();
        }}
        onDeleted={() => {
          push("Space deleted with its contents", "neutral");
          setOpenTag(null);
          invalidateCorpus();
        }}
      />

      <MergeDrawer
        open={mergeOpen}
        spaces={spaces}
        onClose={() => setMergeOpen(false)}
        onDone={(m) => {
          push(
            `Merged ${m.source} into ${m.target} — ${m.movedMemories} memories moved`,
            "good",
          );
          setMergeOpen(false);
          invalidateCorpus();
        }}
      />
      {toasts}
    </>
  );
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="tnum mt-1 text-lg leading-none font-semibold text-brand-black">
        {value}
        {suffix && <span className="ml-1 text-[11px] font-normal text-brand-black/40">{suffix}</span>}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SpaceDrawer({
  space,
  onClose,
  onSaved,
  onDeleted,
}: {
  space: ContainerTag | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [description, setDescription] = useState("");
  const [filterPrompt, setFilterPrompt] = useState("");
  const [shouldFilter, setShouldFilter] = useState(false);
  const [chunkSize, setChunkSize] = useState(1200);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [detail, setDetail] = useState<ContainerTag | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!space) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    setConfirming(false);
    void api
      .getSpace(space.containerTag)
      .then((loaded) => {
        if (cancelled) return;
        setDetail({
          ...space,
          ...loaded,
          containerTag: space.containerTag,
          settings: { ...space.settings, ...loaded.settings },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetailError(
          error instanceof Error ? error.message : "Could not load space settings",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [space]);

  useEffect(() => {
    if (!detail) return;
    setDescription(detail.description);
    setFilterPrompt(detail.settings.filterPrompt ?? "");
    setShouldFilter(!!detail.settings.shouldLLMFilter);
    setChunkSize(detail.settings.chunkSize ?? 1200);
    setInclude(detail.settings.includeItems.join("\n"));
    setExclude(detail.settings.excludeItems.join("\n"));
  }, [detail]);

  if (!space) return null;

  const lines = (s: string) =>
    s.split("\n").map((x) => x.trim()).filter(Boolean);

  return (
    <Drawer
      open
      onClose={onClose}
      title={space.name}
      subtitle={<Copyable value={space.containerTag} className="text-brand-black/55" />}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !detail}
            onClick={async () => {
              setBusy(true);
              await api.updateSpace(space.containerTag, {
                description,
                filterPrompt: filterPrompt.trim() || null,
                shouldLLMFilter: shouldFilter,
                chunkSize,
                includeItems: lines(include),
                excludeItems: lines(exclude),
              });
              setBusy(false);
              onSaved();
            }}
          >
            {busy && <Spinner />}
            Save settings
          </Button>
          {confirming ? (
            <>
              <span className="text-xs text-[color:var(--color-critical)]">
                Deletes {space.memoryCount} memories and {space.documentCount} documents.
              </span>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await api.deleteSpace(space.containerTag);
                  setBusy(false);
                  onDeleted();
                }}
              >
                Delete anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={() => setConfirming(true)}
            >
              <Icon.trash size={13} />
              Delete space
            </Button>
          )}
        </div>
      }
    >
      {!detail ? (
        <div className="space-y-3">
          {detailError ? (
            <p className="text-xs text-[color:var(--color-critical)]">
              {detailError}
            </p>
          ) : (
            <>
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="label mb-2 block">Description</label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="border-t border-brand-black/[0.06] pt-4">
            <Toggle
              checked={shouldFilter}
              onChange={setShouldFilter}
              label="LLM extraction filter"
              hint="Run each chunk past the filter prompt before storing memories."
            />
          </div>

          <div>
            <label className="label mb-2 block">Filter prompt</label>
            <Textarea
              rows={4}
              value={filterPrompt}
              onChange={(e) => setFilterPrompt(e.target.value)}
              disabled={!shouldFilter}
              placeholder="Keep lasting preferences and decisions. Skip scheduling chatter and one-off logistics."
              className={shouldFilter ? "" : "opacity-50"}
            />
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="chunk" className="label">
                Chunk size
              </label>
              <span className="tnum text-xs font-medium text-brand-black">
                {chunkSize} tokens
              </span>
            </div>
            <input
              id="chunk"
              type="range"
              min={400}
              max={2400}
              step={100}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="w-full accent-brand-black"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-black/40">
              Structured documents split on headings regardless; this is the cap.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-2 block">Include (one per line)</label>
              <Textarea
                rows={5}
                value={include}
                onChange={(e) => setInclude(e.target.value)}
                className="mono text-[11px]"
              />
            </div>
            <div>
              <label className="label mb-2 block">Exclude (one per line)</label>
              <Textarea
                rows={5}
                value={exclude}
                onChange={(e) => setExclude(e.target.value)}
                className="mono text-[11px]"
              />
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function MergeDrawer({
  open,
  spaces,
  onClose,
  onDone,
}: {
  open: boolean;
  spaces: ContainerTag[];
  onClose: () => void;
  onDone: (m: MergeStatus) => void;
}) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (spaces.length >= 2) {
      setSource(spaces[0].containerTag);
      setTarget(spaces[1].containerTag);
    }
  }, [spaces]);

  const src = spaces.find((s) => s.containerTag === source);
  const tgt = spaces.find((s) => s.containerTag === target);
  const invalid = !source || !target || source === target;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Merge container tags"
      subtitle="POST /v3/container-tags/merge"
      footer={
        <Button
          variant="primary"
          size="sm"
          disabled={invalid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await api.mergeSpaces(source, target));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner />}
          Merge
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-brand-black/55">
          Everything tagged with the source moves to the target, and the source tag is
          removed. Nothing is deleted — this only re-tags. On a real instance the merge
          is queued and you poll{" "}
          <span className="mono">GET /v3/container-tags/merge/&#123;mergeId&#125;</span>.
        </p>

        <div>
          <label className="label mb-2 block">Source (will be removed)</label>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.containerTag} value={s.containerTag}>
                {s.name} — {s.memoryCount} memories
              </option>
            ))}
          </Select>
        </div>

        <div className="flex justify-center text-brand-black/40" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M9 3v12M5 11l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div>
          <label className="label mb-2 block">Target (receives everything)</label>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {spaces.map((s) => (
              <option key={s.containerTag} value={s.containerTag}>
                {s.name} — {s.memoryCount} memories
              </option>
            ))}
          </Select>
        </div>

        {invalid ? (
          <p className="text-xs text-[color:var(--color-warning)]">
            Pick two different tags.
          </p>
        ) : (
          src &&
          tgt && (
            <div className="rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-2.5 text-xs leading-relaxed text-brand-black/55">
              <span className="text-brand-black/70">{tgt.name}</span> will hold{" "}
              <span className="tnum text-brand-black">
                {src.memoryCount + tgt.memoryCount}
              </span>{" "}
              memories and{" "}
              <span className="tnum text-brand-black">
                {src.documentCount + tgt.documentCount}
              </span>{" "}
              documents. <span className="mono">{src.containerTag}</span> will no longer
              exist.
            </div>
          )
        )}
      </div>
    </Drawer>
  );
}
