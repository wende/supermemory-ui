"use client";

import { useEffect, useMemo, useState } from "react";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Card,
  SectionHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { prefetch, useProfile, useSpaces } from "@/lib/queries";

const INCLUDE = [
  { key: "static" as const, label: "Static", hint: "Asserted facts with no expiry" },
  { key: "dynamic" as const, label: "Dynamic", hint: "Derived, refreshed on ingest" },
  { key: "buckets" as const, label: "Buckets", hint: "Named profile buckets" },
];

export function warm(): void {
  // Profile requires a concrete containerTag — wait until the page picks one.
  void prefetch.spaces();
}

export default function ProfilePage() {
  const { spaces } = useSpaces();
  const [space, setSpace] = useState("");
  const [inc, setInc] = useState({ static: true, dynamic: true, buckets: true });

  // Stable order matches graph space colour assignment (sorted containerTag).
  const sortedSpaces = useMemo(
    () => [...spaces].sort((a, b) => a.containerTag.localeCompare(b.containerTag)),
    [spaces],
  );

  // Profile API is single-space only — always bind to a real container tag.
  useEffect(() => {
    if (!sortedSpaces.length) return;
    if (!sortedSpaces.some((s) => s.containerTag === space)) {
      setSpace(sortedSpaces[0]!.containerTag);
    }
  }, [sortedSpaces, space]);

  const input = useMemo(() => {
    const include = (["static", "dynamic", "buckets"] as const).filter((k) => inc[k]);
    return {
      containerTag: space,
      include: include.length ? [...include] : undefined,
    };
  }, [space, inc]);

  const { data: profile, isLoading: loading } = useProfile(input, {
    keepPreviousData: true,
    enabled: !!space,
  });

  const p = profile?.profile;

  return (
    <PageBody maxWidth="4xl" className="space-y-5">
      <PageTitle
        label="Recall"
        title="Profile"
        description="Always-loaded facts the engine keeps warm — separate from the full search index."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-[9.5rem] sm:w-[168px] sm:flex-none">
          <Select
            value={space}
            onChange={(e) => setSpace(e.target.value)}
            aria-label="Space"
            className="h-10 rounded-full border-brand-black/[0.06] sm:text-[12px] shadow-none"
            disabled={!sortedSpaces.length}
          >
            {sortedSpaces.map((s) => (
              <option key={s.containerTag} value={s.containerTag}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INCLUDE.map((item) => (
            <button
              key={item.key}
              type="button"
              title={item.hint}
              onClick={() => setInc((s) => ({ ...s, [item.key]: !s[item.key] }))}
              className={`focus-ring rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
                inc[item.key]
                  ? "bg-brand-black text-white"
                  : "text-brand-black/55 hover:bg-brand-black/[0.03] hover:text-brand-black/82"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !profile ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {!!p?.static.length && (
            <FactCard
              title="Static facts"
              meta="asserted, no expiry"
              tone="s3"
              facts={p.static}
              note="Standing preferences and constraints. These are superseded explicitly, never on a timer."
            />
          )}

          {!!p?.dynamic.length && (
            <FactCard
              title="Dynamic facts"
              meta="derived, refreshed on ingest"
              tone="s2"
              facts={p.dynamic}
              note="Re-derived as new documents land. Expect these to change week to week."
            />
          )}

          {p && Object.keys(p.buckets ?? {}).length > 0 && (
            <Card>
              <SectionHeader
                title="Buckets"
                meta={`${Object.keys(p.buckets ?? {}).length} defined`}
              />
              <div className="grid gap-px bg-[color:color-mix(in oklab, var(--brand-black) 6%, transparent)] sm:grid-cols-2">
                {Object.entries(p.buckets ?? {}).map(([key, facts]) => (
                  <div key={key} className="bg-card px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="mono text-xs text-brand-black/70">{key}</h3>
                      <span className="tnum text-[11px] text-brand-black/40">
                        {facts.length}
                      </span>
                    </div>
                    <ul className="mt-2.5 space-y-2">
                      {facts.map((f, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-xs leading-relaxed text-brand-black/55"
                        >
                          <span className="mt-[6px] size-1 shrink-0 rounded-full bg-ink-4" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </PageBody>
  );
}

function FactCard({
  title,
  meta,
  facts,
  tone,
  note,
}: {
  title: string;
  meta: string;
  facts: readonly string[];
  tone: "s3" | "s2";
  note: string;
}) {
  return (
    <Card>
      <SectionHeader
        title={title}
        meta={meta}
        description={note}
        action={<Badge tone={tone}>{facts.length}</Badge>}
      />
      <ul className="divide-y divide-brand-black/[0.05]">
        {facts.map((f, i) => (
          <li key={i} className="flex gap-3 px-5 py-3">
            <span
              className="mt-[7px] size-1.5 shrink-0 rounded-full"
              style={{ background: `var(--color-${tone})` }}
              aria-hidden
            />
            <span className="text-[13px] leading-relaxed text-brand-black/70">{f}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
