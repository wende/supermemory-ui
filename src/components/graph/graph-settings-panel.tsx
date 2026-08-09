"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Input, Select, Slider, Toggle } from "@/components/ui";
import { tokenCssVar } from "@/lib/graph/palette";
import { DEFAULT_SETTINGS } from "@/lib/graph/settings";
import { spaceDisplayName } from "@/lib/graph/space-colors";
import type { ColorGroup, ColorToken, GraphSettings } from "@/lib/graph/types";
import type { ContainerTag } from "@/lib/types";
import { cn } from "@/lib/utils";

const QUERY_DEBOUNCE_MS = 220;

const TOKENS: ColorToken[] = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "good",
  "serious",
  "critical",
];

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "focus-ring shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors",
        active
          ? "bg-brand-black text-white"
          : "text-brand-black/55 hover:bg-brand-black/[0.03] hover:text-brand-black/82",
      )}
    >
      {children}
    </button>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return <div className="label mb-1 mt-3 first:mt-0">{children}</div>;
}

export function GraphToolbar({
  settings,
  onChange,
  spaces,
  localActive,
  onExitLocal,
  className,
}: {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  spaces: ContainerTag[];
  localActive: boolean;
  onExitLocal: () => void;
  className?: string;
}) {
  const patch = (partial: Partial<GraphSettings>) =>
    onChange({ ...settings, ...partial });

  // Committing the filter on every keystroke re-derives the visible set and
  // re-runs layout synchronously, so hold the text locally and commit on a
  // pause. Refs keep the timer from committing a stale `settings` snapshot.
  const settingsRef = useRef(settings);
  const onChangeRef = useRef(onChange);
  settingsRef.current = settings;
  onChangeRef.current = onChange;

  const [queryDraft, setQueryDraft] = useState(settings.query);
  const committedQuery = useRef(settings.query);

  useEffect(() => {
    // Settings changed from elsewhere (localStorage hydration, reset).
    if (settings.query === committedQuery.current) return;
    committedQuery.current = settings.query;
    setQueryDraft(settings.query);
  }, [settings.query]);

  useEffect(() => {
    if (queryDraft === committedQuery.current) return;
    const t = setTimeout(() => {
      committedQuery.current = queryDraft;
      onChangeRef.current({ ...settingsRef.current, query: queryDraft });
    }, QUERY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [queryDraft]);

  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
    >
      {localActive && (
        <button
          type="button"
          onClick={onExitLocal}
          className="focus-ring inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-brand-black/[0.08] bg-card px-3 text-[12px] font-medium text-brand-black/75 transition-colors hover:bg-brand-black/[0.03]"
        >
          <Icon.back size={14} />
          Full graph
        </button>
      )}

      <Input
        value={queryDraft}
        onChange={(e) => setQueryDraft(e.target.value)}
        placeholder="Find a person, place, or topic…"
        aria-label="Filter query"
        className="h-9 min-w-0 flex-1 rounded-full border-brand-black/[0.06] shadow-none max-sm:basis-40 sm:w-[190px] sm:flex-none sm:text-[12px]"
      />

      <Select
        value={settings.space}
        onChange={(e) => patch({ space: e.target.value })}
        aria-label="Space"
        className="h-9 min-w-0 flex-1 rounded-full border-brand-black/[0.06] shadow-none max-sm:basis-36 sm:w-[148px] sm:flex-none sm:text-[12px]"
      >
        <option value="">All spaces</option>
        {spaces.map((s) => (
          <option key={s.containerTag} value={s.containerTag}>
            {spaceDisplayName(s.name, s.containerTag)}
          </option>
        ))}
      </Select>

      <FilterChip
        active={settings.showDocuments}
        onClick={() => patch({ showDocuments: !settings.showDocuments })}
        title="Show the documents each memory was extracted from"
      >
        Source documents
      </FilterChip>
      <FilterChip
        active={settings.showForgotten}
        onClick={() => patch({ showForgotten: !settings.showForgotten })}
        title="Retired entries, drawn as hollow rings"
      >
        Forgotten
      </FilterChip>

      {localActive && (
        <div className="flex items-center gap-2 border-l border-brand-black/[0.06] pl-2">
          <span className="text-[11px] text-brand-black/45">Depth</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={settings.localDepth}
            onChange={(e) => patch({ localDepth: Number(e.target.value) })}
            aria-label="Local graph depth"
            className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-brand-black/[0.08] accent-brand-black"
          />
          <span className="tnum text-[11px] text-brand-black/55">
            {settings.localDepth}
          </span>
        </div>
      )}
    </div>
  );
}

export function GraphCustomizeButton({
  settings,
  onChange,
  localActive,
}: {
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  localActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState("");
  const [draftToken, setDraftToken] = useState<ColorToken>("s1");
  const popoverRef = useRef<HTMLDivElement>(null);

  const patch = (partial: Partial<GraphSettings>) =>
    onChange({ ...settings, ...partial });

  const resetToDefaults = () => {
    // Keep toolbar filters and local-graph mode; reset everything this panel owns.
    onChange({
      ...DEFAULT_SETTINGS,
      colorGroups: [],
      query: settings.query,
      space: settings.space,
      showDocuments: settings.showDocuments,
      showForgotten: settings.showForgotten,
      localGraph: settings.localGraph,
      localDepth: settings.localDepth,
    });
    setDraftQuery("");
    setDraftToken("s1");
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        aria-label="Customize graph"
        title="Customize"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "focus-ring inline-flex size-7 items-center justify-center rounded-lg border border-brand-black/[0.06] transition-colors",
          open
            ? "bg-brand-black/[0.06] text-brand-black"
            : "bg-card text-brand-black/70 hover:bg-brand-black/[0.04] hover:text-brand-black",
        )}
      >
        <Icon.sliders size={14} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-[calc(100%+8px)] z-30 max-h-[min(70vh,520px)] w-[260px] overflow-y-auto rounded-xl border border-brand-black/[0.08] bg-background/95 p-3 shadow-[0_16px_40px_rgba(17,17,17,0.12)] backdrop-blur-sm">
          <Subhead>Display</Subhead>
          <Toggle
            checked={settings.showSpaceBlobs}
            onChange={(v) => patch({ showSpaceBlobs: v })}
            label="Space territories"
            hint="Soft blob behind each space's nodes"
          />
          <Toggle
            checked={settings.colorBySpace}
            onChange={(v) => patch({ colorBySpace: v })}
            label="Colour nodes by space"
            hint={
              settings.colorGroups.length > 0
                ? "Paused while custom colour groups are set"
                : "Overrides kind colours"
            }
          />
          <Toggle
            checked={settings.showContainsEdges}
            onChange={(v) => patch({ showContainsEdges: v })}
            label="Show space links"
            hint="Space → memory edges. Usually redundant with territories"
          />
          <Slider
            label="Text fade threshold"
            value={settings.textFade}
            onChange={(v) => patch({ textFade: v })}
          />
          <Slider
            label="Node size"
            value={settings.nodeSize}
            onChange={(v) => patch({ nodeSize: v })}
          />
          <Slider
            label="Link thickness"
            value={settings.linkThickness}
            onChange={(v) => patch({ linkThickness: v })}
          />

          <Subhead>Forces</Subhead>
          <Slider
            label="Center force"
            value={settings.centerForce}
            onChange={(v) => patch({ centerForce: v })}
          />
          <Slider
            label="Repel force"
            value={settings.repelForce}
            onChange={(v) => patch({ repelForce: v })}
          />
          <Slider
            label="Link force"
            value={settings.linkForce}
            onChange={(v) => patch({ linkForce: v })}
          />
          <Slider
            label="Link distance"
            value={settings.linkDistance}
            onChange={(v) => patch({ linkDistance: v })}
          />

          {localActive && (
            <>
              <Subhead>Local graph</Subhead>
              <Toggle
                checked={settings.localIncoming}
                onChange={(v) => patch({ localIncoming: v })}
                label="Incoming"
              />
              <Toggle
                checked={settings.localOutgoing}
                onChange={(v) => patch({ localOutgoing: v })}
                label="Outgoing"
              />
              <Toggle
                checked={settings.neighborLinks}
                onChange={(v) => patch({ neighborLinks: v })}
                label="Neighbour links"
                hint="Keep all edges between included nodes"
              />
            </>
          )}

          <Subhead>Groups</Subhead>
          <p className="mb-2 text-[11px] leading-relaxed text-brand-black/45">
            Colour by query. First match wins.
          </p>
          <ul className="mb-2 space-y-1.5">
            {settings.colorGroups.map((g, i) => (
              <li
                key={g.id}
                className="flex items-center gap-1.5 rounded-lg border border-brand-black/[0.05] px-2 py-1.5"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: tokenCssVar(g.token) }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-brand-black/70">
                  {g.query}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  className="text-brand-black/35 disabled:opacity-30"
                  onClick={() => {
                    if (i === 0) return;
                    const next = [...settings.colorGroups];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    patch({ colorGroups: next });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Remove group"
                  className="text-brand-black/35 hover:text-brand-black/70"
                  onClick={() =>
                    patch({
                      colorGroups: settings.colorGroups.filter(
                        (x) => x.id !== g.id,
                      ),
                    })
                  }
                >
                  <Icon.forget size={12} />
                </button>
              </li>
            ))}
          </ul>
          <Input
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="mentions coffee"
            className="mb-2 h-8 text-[12px]"
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TOKENS.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`Token ${t}`}
                onClick={() => setDraftToken(t)}
                className={cn(
                  "size-5 rounded-full border-2",
                  draftToken === t
                    ? "border-brand-black/70"
                    : "border-transparent",
                )}
                style={{ background: tokenCssVar(t) }}
              />
            ))}
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!draftQuery.trim()}
            onClick={() => {
              const g: ColorGroup = {
                id: `g-${Date.now()}`,
                query: draftQuery.trim(),
                token: draftToken,
              };
              patch({ colorGroups: [...settings.colorGroups, g] });
              setDraftQuery("");
            }}
          >
            Add group
          </Button>

          <div className="mt-3 border-t border-brand-black/[0.06] pt-3">
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-brand-black/55 hover:text-brand-black"
              onClick={resetToDefaults}
            >
              Reset to defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
