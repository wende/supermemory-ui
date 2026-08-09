"use client";

import { useState } from "react";
import { SimilarityMeter } from "@/components/charts";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Empty,
  Skeleton,
} from "@/components/ui";
import { TYPE_LABEL, relTime } from "@/lib/format";
import type { SearchMode, SearchResponse, SearchResult } from "@/lib/types";

export const SEARCH_MODES: { key: SearchMode; label: string; hint: string }[] = [
  { key: "memories", label: "Memories", hint: "Extracted claims only — lowest latency" },
  { key: "hybrid", label: "Hybrid", hint: "Memories plus raw document chunks" },
  { key: "documents", label: "Documents", hint: "Chunk-level search over source text" },
];

export const SEARCH_PIPELINE = [
  {
    key: "rerank" as const,
    label: "Rerank",
    hint: "Cross-encoder pass. ~140ms; pays off above ~20 candidates.",
  },
  {
    key: "rewrite" as const,
    label: "Rewrite",
    hint: "Expand an underspecified query before retrieval.",
  },
  {
    key: "aggregate" as const,
    label: "Aggregate",
    hint: "Collapse near-duplicate memories into one result.",
  },
];

export const SEARCH_INCLUDE = [
  { key: "docs" as const, label: "Documents", hint: "Include source documents" },
  { key: "chunks" as const, label: "Chunks", hint: "Include matching chunks" },
  {
    key: "forgotten" as const,
    label: "Forgotten",
    hint: "Off by default — retired entries are excluded from recall.",
  },
];

export type SearchPipelineState = {
  rerank: boolean;
  rewrite: boolean;
  aggregate: boolean;
};

export type SearchIncludeState = {
  docs: boolean;
  chunks: boolean;
  forgotten: boolean;
};

export function SearchOptionsPanel({
  searchMode,
  onSearchModeChange,
  pipeline,
  onTogglePipeline,
  include,
  onToggleInclude,
  threshold,
  onThresholdChange,
  limit,
  onLimitChange,
}: {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  pipeline: SearchPipelineState;
  onTogglePipeline: (key: keyof SearchPipelineState) => void;
  include: SearchIncludeState;
  onToggleInclude: (key: keyof SearchIncludeState) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
  limit: number;
  onLimitChange: (value: number) => void;
}) {
  return (
    <Card>
      <div className="space-y-4 px-6 py-5">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
            Search mode
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEARCH_MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.hint}
                onClick={() => onSearchModeChange(item.key)}
                className={`focus-ring rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
                  searchMode === item.key
                    ? "bg-brand-black text-white"
                    : "text-brand-black/55 hover:bg-brand-black/[0.03]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
            Pipeline
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEARCH_PIPELINE.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.hint}
                onClick={() => onTogglePipeline(item.key)}
                className={`focus-ring rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
                  pipeline[item.key]
                    ? "bg-brand-black text-white"
                    : "text-brand-black/55 hover:bg-brand-black/[0.03]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
            Include
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SEARCH_INCLUDE.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.hint}
                onClick={() => onToggleInclude(item.key)}
                className={`focus-ring rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
                  include[item.key]
                    ? "bg-brand-black text-white"
                    : "text-brand-black/55 hover:bg-brand-black/[0.03]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex min-w-[180px] flex-1 items-center gap-2.5 text-[12px] text-brand-black/70">
            <span className="shrink-0">Threshold</span>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              className="h-1.5 w-full accent-brand-black"
              aria-label="Similarity threshold"
            />
            <span className="tnum w-8 shrink-0 text-right font-medium text-brand-black">
              {threshold.toFixed(2)}
            </span>
          </label>
          <label className="flex min-w-[160px] flex-1 items-center gap-2.5 text-[12px] text-brand-black/70">
            <span className="shrink-0">Limit</span>
            <input
              type="range"
              min={3}
              max={50}
              step={1}
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-1.5 w-full accent-brand-black"
              aria-label="Result limit"
            />
            <span className="tnum w-6 shrink-0 text-right font-medium text-brand-black">
              {limit}
            </span>
          </label>
        </div>
      </div>
    </Card>
  );
}

export function SearchResultsPanel({
  loading,
  res,
  threshold,
  pipeline,
  onRetryAtThreshold,
}: {
  loading: boolean;
  res: SearchResponse | null;
  threshold: number;
  pipeline: SearchPipelineState;
  onRetryAtThreshold: (threshold: number) => void;
}) {
  if (loading && !res) {
    return (
      <Card>
        <div className="divide-y divide-brand-black/[0.05]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-4">
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!res) return null;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3 text-[12px] text-brand-black/55">
        <span>
          <span className="tnum font-medium text-brand-black">{res.total}</span>{" "}
          {res.total === 1 ? "match" : "matches"}
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="tnum font-medium text-brand-black">{res.timing}</span>ms
        </span>
        {pipeline.rerank && <Badge tone="s1">reranked</Badge>}
        {pipeline.aggregate && <Badge tone="s2">aggregated</Badge>}
        {pipeline.rewrite && <Badge tone="s3">query rewritten</Badge>}
      </div>

      {res.results.length === 0 ? (
        <Card>
          <Empty
            title="Nothing above the similarity threshold"
            hint={`Lower the threshold below ${threshold.toFixed(2)}, widen the mode to hybrid, or rephrase.`}
            action={
              <Button size="sm" onClick={() => onRetryAtThreshold(0.4)}>
                Retry at 0.40
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-brand-black/[0.05]">
            {res.results.map((r, i) => (
              <li key={`${r.id}-${i}`}>
                <ResultRow result={r} rank={i + 1} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function ResultRow({ result, rank }: { result: SearchResult; rank: number }) {
  const [open, setOpen] = useState(false);
  const ctx = result.context;
  const contextCount =
    (ctx?.parents.length ?? 0) + (ctx?.children.length ?? 0) + (ctx?.related.length ?? 0);

  return (
    <div>
      <div className="flex items-start gap-3 px-6 py-4">
        <span className="tnum mt-0.5 w-5 shrink-0 text-right text-[11px] text-brand-black/40">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug text-brand-black">{result.memory}</p>

          {result.chunk && (
            <p className="mt-2 border-l-2 border-brand-black/15 pl-3 text-[12px] leading-relaxed text-brand-black/55">
              {result.chunk.length > 320
                ? result.chunk.slice(0, 317) + "…"
                : result.chunk}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <SimilarityMeter value={result.similarity} />
            <span className="text-[11px] text-brand-black/40">{relTime(result.updatedAt)}</span>
            {result.version != null && (
              <span className="text-[11px] text-brand-black/35">v{result.version}</span>
            )}
            {result.isAggregated && <Badge tone="s2">aggregated</Badge>}
            <Copyable value={result.id} className="text-brand-black/40" />
            {(contextCount > 0 || result.documents?.length) && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="focus-ring ml-auto rounded text-[11px] text-brand-black/55 transition-colors hover:text-brand-black"
              >
                {open ? "Hide" : "Show"} context
                {contextCount > 0 && ` (${contextCount})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-brand-black/[0.05] bg-brand-black/[0.015] px-6 py-4">
          {!!result.documents?.length && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
                Source documents
              </div>
              <ul className="space-y-1.5">
                {result.documents.map((d) => (
                  <li key={d.id} className="flex items-start gap-2">
                    <span className="mt-px shrink-0 text-brand-black/40" aria-hidden>
                      <Icon.document size={12} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs text-brand-black/70">{d.title}</div>
                      <div className="mt-0.5 text-[11px] text-brand-black/40">
                        {TYPE_LABEL[d.type]} · {relTime(d.createdAt)}
                      </div>
                      {d.summary && (
                        <p className="mt-1 text-[11px] leading-relaxed text-brand-black/55">
                          {d.summary}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ctx && (
            <>
              <ContextList title="Builds on" nodes={ctx.parents} tone="s5" />
              <ContextList title="Built on by" nodes={ctx.children} tone="s2" />
              <ContextList title="Shares a source with" nodes={ctx.related} tone="neutral" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ContextList({
  title,
  nodes,
  tone,
}: {
  title: string;
  nodes: { relation: string; memory: string }[];
  tone: "s5" | "s2" | "neutral";
}) {
  if (!nodes.length) return null;
  return (
    <div>
      <div className="label mb-2">{title}</div>
      <ul className="space-y-1.5">
        {nodes.map((n, i) => (
          <li key={i} className="flex items-start gap-2">
            <Badge tone={tone} className="mt-px shrink-0">
              {n.relation}
            </Badge>
            <span className="text-xs leading-relaxed text-brand-black/55">{n.memory}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
