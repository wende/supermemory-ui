"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Button,
  Card,
  Input,
  Select,
  Spinner,
  Textarea,
  Toggle,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import { invalidateCorpus, prefetch, useProcessing, useSpaces } from "@/lib/queries";
import { STATUS_COLOR, STATUS_LABEL, relTime } from "@/lib/format";
import { PIPELINE_STAGES } from "@/lib/types";
import type { Document, DocumentType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "note" | "url" | "file" | "fact" | "batch";

const TABS: { key: Tab; label: string; icon: keyof typeof Icon }[] = [
  { key: "note", label: "Write", icon: "edit" },
  { key: "url", label: "Link", icon: "link" },
  { key: "file", label: "Upload", icon: "upload" },
  { key: "fact", label: "Fact", icon: "spark" },
  { key: "batch", label: "Batch", icon: "document" },
];

export function warm(): void {
  void prefetch.spaces();
  void prefetch.processing();
}

export default function AddPage() {
  const [tab, setTab] = useState<Tab>("note");
  const [space, setSpace] = useState("sm_personal");
  const { push, view: toasts } = useToasts();

  const { spaces } = useSpaces();
  useEffect(() => {
    if (spaces.length && !spaces.some((s) => s.containerTag === space)) {
      setSpace(spaces[0].containerTag);
    }
  }, [spaces, space]);

  // Track the pipeline while it is busy. `useQuery` pauses the timer whenever
  // this tab is off screen.
  const [poll, setPoll] = useState<number | false>(false);
  const { documents: inflight } = useProcessing({ refetchInterval: poll });
  useEffect(() => {
    setPoll(inflight.length > 0 && 1200);
  }, [inflight.length]);

  const filterPrompt = spaces.find((s) => s.containerTag === space)?.settings.filterPrompt;

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-6">
        <PageTitle
          label="Ingest"
          title="Add memory"
          description="Ingest documents for extraction, or assert a fact directly."
        >
          <Link
            href="/documents"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-black/45 transition-colors duration-200 hover:text-brand-black"
          >
            All documents
          </Link>
        </PageTitle>

        {/* Swipeable on a phone rather than wrapping to a second row */}
        <div className="scrollbar-hide animate-fade-in flex max-w-full gap-1.5 overflow-x-auto rounded-[22px] border border-brand-black/[0.06] bg-card/90 p-1.5 shadow-[0_18px_45px_rgba(17,17,17,0.05)] sm:flex-wrap sm:overflow-visible">
          {TABS.map((t) => {
            const I = Icon[t.icon];
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "focus-ring flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-200",
                  active
                    ? "bg-brand-black text-white"
                    : "text-brand-black/55 hover:bg-brand-black/[0.03] hover:text-brand-black/82",
                )}
              >
                <I size={13} className={active ? "opacity-90" : "opacity-55"} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-5">
            <Field label="Target space">
              <Select
                id="space"
                value={space}
                onChange={(e) => setSpace(e.target.value)}
                className="h-10 rounded-full border-brand-black/[0.06] bg-card sm:text-[12px] shadow-none"
              >
                {spaces.map((s) => (
                  <option key={s.containerTag} value={s.containerTag}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {filterPrompt && (
                <p className="mt-2 text-[12px] leading-relaxed text-brand-black/45">
                  <span className="text-brand-black/60">Filter · </span>
                  {filterPrompt}
                </p>
              )}
            </Field>

            {tab === "note" && (
              <NoteForm
                space={space}
                onDone={(t) => {
                  push(`Queued “${t}” for extraction`, "good");
                  invalidateCorpus();
                }}
              />
            )}
            {tab === "url" && (
              <UrlForm
                space={space}
                onDone={(t) => {
                  push(`Queued ${t}`, "good");
                  invalidateCorpus();
                }}
              />
            )}
            {tab === "file" && (
              <FileForm
                space={space}
                onDone={(t) => {
                  push(`Uploaded ${t}`, "good");
                  invalidateCorpus();
                }}
              />
            )}
            {tab === "fact" && (
              <FactForm
                space={space}
                onDone={() => {
                  push("Memory asserted — no extraction needed", "good");
                  invalidateCorpus();
                }}
              />
            )}
            {tab === "batch" && (
              <BatchForm
                space={space}
                onDone={(n) => {
                  push(`Queued ${n} documents`, "good");
                  invalidateCorpus();
                }}
              />
            )}
        </div>

        <Card>
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
                Pipeline
              </div>
              <h2 className="mt-1 text-[15px] font-semibold text-brand-black">
                In flight
              </h2>
            </div>
            <span className="text-[11px] text-brand-black/45">
              {inflight.length ? `${inflight.length} active` : "Idle"}
            </span>
          </div>
          <div className="border-t border-brand-black/[0.05]">
            {inflight.length === 0 ? (
              <p className="px-6 py-4 text-[12px] text-brand-black/55">
                Nothing processing right now.
              </p>
            ) : (
              <ul className="divide-y divide-brand-black/[0.05]">
                {inflight.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3.5 px-6 py-4 transition-colors duration-200 hover:bg-brand-black/[0.025]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] leading-relaxed text-brand-black">
                        {d.title}
                      </p>
                      <PipelineTrack status={d.status} />
                      <p className="mt-1 text-[11px] text-brand-black/40">
                        {relTime(d.createdAt)}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[11px]"
                      style={{ color: STATUS_COLOR[d.status] }}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </PageBody>

      {toasts}
    </>
  );
}

function PipelineTrack({ status }: { status: Document["status"] }) {
  const idx = PIPELINE_STAGES.indexOf(status as (typeof PIPELINE_STAGES)[number]);
  const failed = status === "failed";
  return (
    <div className="mt-1.5 flex gap-[2px]" aria-hidden>
      {PIPELINE_STAGES.map((stage, i) => (
        <span
          key={stage}
          className="h-[3px] flex-1 rounded-full transition-colors"
          style={{
            background: failed
              ? i === 0
                ? "var(--color-critical)"
                : "color-mix(in oklab, var(--brand-black) 8%, transparent)"
              : i <= idx
                ? status === "done"
                  ? "var(--color-good)"
                  : "var(--color-warning-status)"
                : "color-mix(in oklab, var(--brand-black) 8%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const DOC_TYPES: DocumentType[] = ["text", "webpage", "notion_doc", "github_markdown", "tweet"];

const pillField =
  "h-10 rounded-full border-brand-black/[0.06] bg-card sm:text-[12px] shadow-none";
const pillPrimary =
  "h-10 rounded-full bg-brand-black px-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white hover:bg-brand-black/92";

function NoteForm({ space, onDone }: { space: string; onDone: (t: string) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<DocumentType>("text");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api.addDocument({
            content,
            title: title.trim() || undefined,
            type,
            containerTags: [space],
          });
          onDone(r.title);
          setTitle("");
          setContent("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Title" hint="Optional">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Notes from Tuesday's walk"
          className={pillField}
        />
      </Field>
      <Field label="Content">
        <Textarea
          rows={10}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Whatever you'd tell a sharp friend so they remember it later — a decision, a preference, a story from the week."
          className="rounded-2xl border-brand-black/[0.06] text-[13px] leading-relaxed shadow-none"
          required
        />
      </Field>
      <Field label="Type">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType)}
          className={pillField}
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        type="submit"
        variant="primary"
        disabled={busy || !content.trim()}
        className={pillPrimary}
      >
        {busy && <Spinner />}
        Ingest
      </Button>
    </form>
  );
}

function UrlForm({ space, onDone }: { space: string; onDone: (t: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.addDocument({ url, type: "webpage", containerTags: [space] });
          onDone(url);
          setUrl("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="URL">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/that-article-you-keep-quoting"
          className={pillField}
          required
        />
      </Field>
      <Button
        type="submit"
        variant="primary"
        disabled={busy || !url.trim()}
        className={pillPrimary}
      >
        {busy && <Spinner />}
        Fetch and ingest
      </Button>
      <p className="text-[12px] leading-relaxed text-brand-black/55">
        Redirects resolve and workspace include/exclude rules apply before anything is stored.
      </p>
    </form>
  );
}

function FileForm({ space, onDone }: { space: string; onDone: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await api.uploadFile(f, [space]);
        onDone(f.name);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => ref.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-14 text-center transition-colors duration-200",
          over
            ? "border-brand-black/25 bg-brand-black/[0.03]"
            : "border-brand-black/[0.12] hover:border-brand-black/20 hover:bg-brand-black/[0.02]",
        )}
      >
        {busy ? (
          <Spinner className="text-brand-black/70" />
        ) : (
          <Icon.upload size={20} className="text-brand-black/45" />
        )}
        <div className="text-[13px] text-brand-black/70">
          {busy ? "Uploading…" : "Drop files, or click to choose"}
        </div>
        <div className="text-[11px] text-brand-black/40">
          PDF, images, audio, video, markdown, plain text
        </div>
        <input
          ref={ref}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      <p className="text-[12px] leading-relaxed text-brand-black/55">
        Images go through OCR and PDFs through a layout-aware parser before chunking.
      </p>
    </div>
  );
}

function FactForm({ space, onDone }: { space: string; onDone: () => void }) {
  const [memory, setMemory] = useState("");
  const [isStatic, setIsStatic] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.createMemory({ memory: memory.trim(), containerTag: space, isStatic });
          onDone();
          setMemory("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Memory" hint="One standalone claim">
        <Textarea
          rows={4}
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder="I don't take meetings before 10, and weekends are off-limits except for real emergencies."
          className="rounded-2xl border-brand-black/[0.06] text-[13px] leading-relaxed shadow-none"
          required
        />
      </Field>
      <Toggle
        checked={isStatic}
        onChange={setIsStatic}
        label="Static fact"
        hint="Never expires on a timer — superseded or retired explicitly."
      />
      <Button
        type="submit"
        variant="primary"
        disabled={busy || !memory.trim()}
        className={pillPrimary}
      >
        {busy && <Spinner />}
        Store memory
      </Button>
      <p className="text-[12px] leading-relaxed text-brand-black/55">
        Writes straight to the memory layer, skipping chunking and extraction.
      </p>
    </form>
  );
}

function BatchForm({ space, onDone }: { space: string; onDone: (n: number) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const docs = text
    .split(/\n---+\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const res = await api.addBatch(
            docs.map((d) => ({ content: d, containerTags: [space] })),
          );
          onDone(res.accepted);
          setText("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Documents" hint="Separate with a --- line">
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "I prefer to write things down before meetings.\n\n---\n\nWeekend mornings are for reading, not Slack."
          }
          className="mono rounded-2xl border-brand-black/[0.06] text-xs leading-relaxed shadow-none"
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !docs.length}
          className={pillPrimary}
        >
          {busy && <Spinner />}
          Ingest {docs.length || 0} {docs.length === 1 ? "document" : "documents"}
        </Button>
        {docs.length > 0 && (
          <span className="text-[11px] text-brand-black/45">
            {docs.length} parsed from separators
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/45">
          {label}
        </label>
        {hint && <span className="text-[11px] text-brand-black/35">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
