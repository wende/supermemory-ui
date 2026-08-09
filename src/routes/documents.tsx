"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRouteParams } from "@/components/route-host";
import { Icon } from "@/components/icons";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Drawer,
  Empty,
  Input,
  Select,
  Skeleton,
  Spinner,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import { invalidateCorpus, prefetch, useDocumentList, useSpaces } from "@/lib/queries";
import { usePageVisible } from "@/lib/query";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TYPE_LABEL,
  bytes,
  relTime,
  shortDate,
} from "@/lib/format";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/types";
import type { Document, DocumentChunk } from "@/lib/types";

/** The list the tab opens on — shared with `warm()` so the cache keys match. */
const FIRST_PAGE = { page: 1, limit: 20 } as const;

export function warm(): void {
  void prefetch.spaces();
  void prefetch.documents(FIRST_PAGE);
}

export default function DocumentsView() {
  const params = useRouteParams();
  const router = useRouter();
  const visible = usePageVisible();
  const { push, view: toasts } = useToasts();

  const { spaces } = useSpaces();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [space, setSpace] = useState("");
  const [type, setType] = useState("");
  const statusParam = params.get("status");
  const [status, setStatus] = useState(() => statusParam ?? "");
  // Cleared locally when a close happens while this tab is hidden, so an async
  // delete cannot router.replace another tab's URL and the drawer stays shut.
  const [suppressOpen, setSuppressOpen] = useState(false);

  // Deep links like `/documents?status=failed` must win even though the tab
  // stays mounted. The URL is the source of truth for the status filter.
  useEffect(() => {
    setStatus(statusParam ?? "");
  }, [statusParam]);

  const writeStatusParam = useCallback(
    (next: string) => {
      setStatus(next);
      if (!visible) return;
      const search = new URLSearchParams(params.toString());
      if (next) search.set("status", next);
      else search.delete("status");
      const qs = search.toString();
      router.replace(qs ? `/documents?${qs}` : "/documents", { scroll: false });
    },
    [params, router, visible],
  );

  // URL is the source of truth for the open drawer (`?doc=<id>`).
  const openId = suppressOpen ? null : params.get("doc");

  const setOpenId = useCallback(
    (id: string | null) => {
      if (!id) {
        setSuppressOpen(true);
        if (!visible) return;
      } else {
        setSuppressOpen(false);
        if (!visible) return;
      }
      const next = new URLSearchParams(params.toString());
      if (id) next.set("doc", id);
      else next.delete("doc");
      const qs = next.toString();
      // Always target this tab's path — never `usePathname()`, which belongs to
      // whichever tab is currently on screen.
      router.replace(qs ? `/documents?${qs}` : "/documents", { scroll: false });
    },
    [params, router, visible],
  );

  useEffect(() => {
    if (!visible || !suppressOpen) return;
    if (!params.get("doc")) {
      setSuppressOpen(false);
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.delete("doc");
    const qs = next.toString();
    router.replace(qs ? `/documents?${qs}` : "/documents", { scroll: false });
    setSuppressOpen(false);
  }, [visible, suppressOpen, params, router]);

  // Typing should not fire a request per keystroke; the cache keys off the
  // settled term so an earlier prefix stays cached and instant to go back to.
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), q ? 220 : 0);
    return () => clearTimeout(t);
  }, [q]);

  // Keep the list live while anything is still processing. `useQuery` pauses
  // the timer whenever this tab is off screen.
  const [poll, setPoll] = useState<number | false>(false);

  const input = useMemo(
    () => ({
      ...FIRST_PAGE,
      containerTags: space ? [space] : undefined,
      q: debouncedQ.trim() || undefined,
      types: type ? [type] : undefined,
      statuses: status ? [status] : undefined,
      page,
    }),
    [space, debouncedQ, type, status, page],
  );

  const { data, isLoading, isFetching } = useDocumentList(input, {
    keepPreviousData: true,
    refetchInterval: poll,
  });

  const docs = useMemo(() => data?.memories ?? [], [data]);
  const total = data?.pagination.totalItems ?? 0;
  const pages = data?.pagination.totalPages ?? 1;
  const loading = isLoading || (isFetching && !data);

  const inflight = docs.some((d) => d.status !== "done" && d.status !== "failed");
  useEffect(() => {
    setPoll(inflight && 1500);
  }, [inflight]);

  useEffect(() => setPage(1), [space, debouncedQ, type, status]);

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-5">
        <PageTitle
          label="Ingest"
          title="Documents"
          description="Everything ingested and where each item sits in the pipeline."
        >
          <Link href="/add">
            <Button size="sm" variant="primary" className="rounded-full">
              <Icon.add size={14} />
              Add document
            </Button>
          </Link>
        </PageTitle>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-[12.5rem]">
            <Icon.search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-brand-black/40"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles and notes…"
              className="h-10 rounded-full border-brand-black/[0.06] pl-8 sm:text-[12px] shadow-none"
              aria-label="Filter documents"
            />
          </div>
          <div className="min-w-0 flex-1 basis-[8.5rem] sm:w-[150px] sm:flex-none">
            <Select value={space} onChange={(e) => setSpace(e.target.value)} aria-label="Space" className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none">
              <option value="">All spaces</option>
              {spaces.map((s) => (
                <option key={s.containerTag} value={s.containerTag}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1 basis-[8.5rem] sm:w-[150px] sm:flex-none">
            <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none">
              <option value="">All types</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1 basis-[8.5rem] sm:w-[150px] sm:flex-none">
            <Select value={status} onChange={(e) => writeStatusParam(e.target.value)} aria-label="Status" className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none">
              <option value="">All statuses</option>
              {DOCUMENT_STATUSES.filter((s) => s !== "unknown").map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="text-xs text-brand-black/40 tnum">
          {loading ? "…" : `${total} ${total === 1 ? "document" : "documents"}`}
        </div>

        {loading && !docs.length ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <Card>
            <Empty
              title="No documents match"
              hint="Clear the filters, or ingest something new."
              action={
                <Button size="sm" onClick={() => { setQ(""); setSpace(""); setType(""); writeStatusParam(""); }}>
                  Clear filters
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-brand-black/[0.05]">
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => setOpenId(d.id)}
                    className="focus-ring group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-black/[0.025]"
                  >
                    <span
                      className="flex w-5 shrink-0 items-center justify-center text-brand-black/40"
                      aria-hidden
                    >
                      <Icon.document size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-brand-black">
                        {d.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-brand-black/40">
                        <span>{TYPE_LABEL[d.type]}</span>
                        <span aria-hidden>·</span>
                        <span>{d.containerTags?.[0] ?? "—"}</span>
                        <span aria-hidden>·</span>
                        <span>{relTime(d.createdAt)}</span>
                        {d.filepath && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="mono truncate">{d.filepath}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 sm:flex">
                      {!!d.chunkCount && (
                        <span className="tnum text-[11px] text-brand-black/40">
                          {d.chunkCount} chunks
                        </span>
                      )}
                      <span
                        className="flex items-center gap-1.5 text-[11px]"
                        style={{ color: STATUS_COLOR[d.status] }}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            d.status !== "done" && d.status !== "failed"
                              ? "animate-soft-pulse"
                              : ""
                          }`}
                          style={{ background: "currentColor" }}
                        />
                        {STATUS_LABEL[d.status]}
                      </span>
                    </span>
                    <Icon.chevron
                      size={14}
                      className="shrink-0 text-brand-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-brand-black/55 tnum">
              {page} / {pages}
            </span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </PageBody>

      <DocumentDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        onDeleted={() => {
          push("Document deleted", "neutral");
          setOpenId(null);
          invalidateCorpus();
        }}
      />
      {toasts}
    </>
  );
}

/* ------------------------------------------------------------------ */

function DocumentDrawer({
  id,
  onClose,
  onDeleted,
}: {
  id: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [tab, setTab] = useState<"content" | "chunks" | "meta">("content");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDoc(null);
    setChunks([]);
    setTab("content");
    setConfirming(false);
    if (!id) return;
    api.getDocument(id).then(setDoc).catch(() => setDoc(null));
    api.getChunks(id).then((r) => setChunks(r.chunks)).catch(() => {});
  }, [id]);

  if (!id) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={doc?.title ?? "Loading…"}
      subtitle={
        doc && (
          <span className="flex flex-wrap items-center gap-2">
            <Copyable value={doc.id} className="text-brand-black/55" />
            <span aria-hidden>·</span>
            <span>{TYPE_LABEL[doc.type]}</span>
            <span aria-hidden>·</span>
            <span style={{ color: STATUS_COLOR[doc.status] }}>
              {STATUS_LABEL[doc.status]}
            </span>
          </span>
        )
      }
      footer={
        doc && (
          <div className="flex flex-wrap items-center gap-2">
            {doc.url && (
              <a href={doc.url} target="_blank" rel="noreferrer">
                <Button size="sm">
                  <Icon.external size={13} />
                  Open source
                </Button>
              </a>
            )}
            {confirming ? (
              <>
                <span className="text-xs text-brand-black/55">
                  Delete this document and its chunks?
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await api.deleteDocument(doc.id);
                    setBusy(false);
                    onDeleted();
                  }}
                >
                  {busy && <Spinner />}
                  Delete
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
                Delete
              </Button>
            )}
          </div>
        )
      }
    >
      {!doc ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : (
        <div className="space-y-4">
          {doc.summary && (
            <p className="rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-2.5 text-xs leading-relaxed text-brand-black/70">
              {doc.summary}
            </p>
          )}

          <div className="flex gap-1.5">
            {(
              [
                ["content", "Content"],
                ["chunks", `Chunks (${chunks.length})`],
                ["meta", "Record"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`focus-ring rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  tab === k
                    ? "border-brand-black/[0.12] bg-brand-black/[0.05] text-brand-black"
                    : "border-brand-black/[0.06] text-brand-black/55 hover:text-brand-black/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "content" && (
            <pre className="mono whitespace-pre-wrap rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-3 text-[11.5px] leading-relaxed text-brand-black/70">
              {doc.content || "Content withheld from the list response — fetched per document."}
            </pre>
          )}

          {tab === "chunks" && (
            <>
              {chunks.length === 0 ? (
                <p className="text-xs text-brand-black/55">
                  No chunks yet — the document has not finished indexing.
                </p>
              ) : (
                <ul className="space-y-2">
                  {chunks.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-2.5"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-brand-black/40">
                        <span className="mono">position {c.position}</span>
                        <span className="tnum">{c.tokens} tokens</span>
                      </div>
                      <p className="text-[11.5px] leading-relaxed whitespace-pre-wrap text-brand-black/55">
                        {c.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "meta" && (
            <dl className="space-y-1.5 text-xs">
              <MetaRow label="ID" value={doc.id} mono />
              {doc.customId && <MetaRow label="Custom ID" value={doc.customId} mono />}
              <MetaRow label="Type" value={TYPE_LABEL[doc.type]} />
              <MetaRow label="Status" value={STATUS_LABEL[doc.status]} />
              <MetaRow
                label="Spaces"
                value={(doc.containerTags ?? []).join(", ") || "—"}
                mono
              />
              <MetaRow label="Created" value={shortDate(doc.createdAt)} />
              <MetaRow label="Updated" value={shortDate(doc.updatedAt)} />
              {doc.filepath && <MetaRow label="Path" value={doc.filepath} mono />}
              {doc.url && <MetaRow label="URL" value={doc.url} mono />}
              <MetaRow label="Chunks" value={String(doc.chunkCount ?? 0)} />
              <MetaRow label="Size" value={bytes(doc.content.length)} />
              {doc.metadata &&
                Object.entries(doc.metadata).map(([k, v]) => (
                  <MetaRow key={k} label={k} value={String(v)} mono />
                ))}
            </dl>
          )}
        </div>
      )}
    </Drawer>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-brand-black/[0.06] pb-1.5">
      <dt className="shrink-0 text-brand-black/40">{label}</dt>
      <dd className={`truncate text-right text-brand-black/70 ${mono ? "mono text-[11px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
