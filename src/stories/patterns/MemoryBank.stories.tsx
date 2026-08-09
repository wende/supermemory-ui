import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageBody, PageTitle } from "@/components/shell";
import { PanelCard } from "@/components/blocks/panel-card";
import { EmptyState } from "@/components/blocks/empty-state";
import { LoadingState } from "@/components/blocks/loading-state";
import {
  Badge,
  Button,
  Copyable,
  Drawer,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { MEMORIES, SPACES } from "@/stories/fixtures";
import { relTime } from "@/lib/format";
import type { MemoryEntry } from "@/lib/types";

/**
 * The memory bank — a filtered list with a detail drawer. This is the console's
 * most-used screen, and the one where the list-row conventions are set.
 *
 * Conventions on show here:
 *
 * - **The memory text is the row.** It is selectable and copyable without
 *   opening anything, because reading a fact is more common than inspecting
 *   one.
 * - **Flags are outlined badges, not fills.** A row can carry three of them
 *   without becoming a colour field.
 * - **A forgotten memory is dimmed, not hidden.** Forgetting is a state; the
 *   row stays auditable.
 * - **Meta is one line at 11px/45%** — relative time, source count, version.
 */
const meta: Meta = {
  title: "Patterns/Memory bank",
  parameters: {
    layout: "fullscreen",
    docs: { story: { height: "760px", inline: false } },
  },
};

export default meta;
type Story = StoryObj;

function MemoryRow({
  memory,
  onOpen,
}: {
  memory: MemoryEntry;
  onOpen: () => void;
}) {
  return (
    <div
      className={`px-6 py-3.5 transition-colors hover:bg-brand-black/[0.02] ${
        memory.isForgotten ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-brand-black">
            {memory.memory}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] text-brand-black/45">
              {relTime(memory.updatedAt)}
            </span>
            <span className="text-[11px] text-brand-black/25">·</span>
            <span className="tnum text-[11px] text-brand-black/45">
              {memory.sourceCount} sources
            </span>
            <span className="text-[11px] text-brand-black/25">·</span>
            <Copyable value={memory.id} className="text-brand-black/35">
              <span className="mono text-[11px]">
                {memory.id.slice(0, 14)}…
              </span>
            </Copyable>
            {memory.isStatic && <Badge tone="s3">asserted</Badge>}
            {memory.isInference && <Badge tone="s2">inferred</Badge>}
            {memory.isForgotten && <Badge tone="critical">forgotten</Badge>}
            {(memory.memoryRelations?.length ?? 0) > 0 && (
              <Badge tone="s5">
                {memory.memoryRelations!.length} relations
              </Badge>
            )}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onOpen} className="shrink-0">
          <Icon.chevron size={14} />
        </Button>
      </div>
    </div>
  );
}

/** The populated list, with a working detail drawer. */
export const Populated: Story = {
  render: function Populated() {
    const [query, setQuery] = React.useState("");
    const [space, setSpace] = React.useState("");
    const [open, setOpen] = React.useState<MemoryEntry | null>(null);

    const rows = MEMORIES.filter(
      (m) =>
        (!space || m.spaceId === space) &&
        (!query || m.memory.toLowerCase().includes(query.toLowerCase())),
    ).slice(0, 12);

    return (
      <div className="min-h-[760px] bg-background">
        <PageBody maxWidth="4xl">
          <PageTitle
            label="Memory"
            title="Memory bank"
            description="Every durable fact the engine has extracted, newest first. Versions are kept — forgetting is a state, not a delete."
          >
            <Button size="sm" variant="primary">
              <Icon.add size={13} />
              Add memory
            </Button>
          </PageTitle>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a name, place, or phrase…"
              aria-label="Filter memories"
              className="h-9 w-full sm:w-72"
            />
            <Select
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              aria-label="Space"
              className="h-9 w-48"
            >
              <option value="">All spaces</option>
              {SPACES.map((s) => (
                <option key={s.containerTag} value={s.containerTag}>
                  {s.name}
                </option>
              ))}
            </Select>
            <span className="tnum ml-auto text-[11px] text-brand-black/45">
              {rows.length} shown
            </span>
          </div>

          <PanelCard className="mt-4" stagger>
            {rows.length === 0 ? (
              <EmptyState
                icon={Icon.memory}
                title="No memories match that filter"
                description="Try a broader query, or clear the space filter to search the whole corpus."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setSpace("");
                    }}
                  >
                    <Icon.filter size={13} />
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-brand-black/[0.05]">
                {rows.map((m) => (
                  <MemoryRow key={m.id} memory={m} onOpen={() => setOpen(m)} />
                ))}
              </div>
            )}
          </PanelCard>
        </PageBody>

        <Drawer
          open={!!open}
          onClose={() => setOpen(null)}
          title={open?.memory ?? ""}
          subtitle={
            open
              ? `v${open.version} · ${open.sourceCount} sources · updated ${relTime(open.updatedAt)}`
              : undefined
          }
          footer={
            <div className="flex justify-between gap-2">
              <Button size="sm" variant="ghost">
                <Icon.graph size={13} />
                Open in graph
              </Button>
              <Button size="sm" variant="danger">
                <Icon.forget size={13} />
                Forget
              </Button>
            </div>
          }
        >
          {open && (
            <div className="space-y-5">
              <Copyable value={open.id} className="text-brand-black/40" />
              <div>
                <div className="label mb-2">History</div>
                <ol className="space-y-2">
                  {open.history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-xl border border-brand-black/[0.06] bg-muted px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="tnum text-[11px] font-medium text-brand-black/70">
                          v{h.version}
                        </span>
                        <span className="text-[11px] text-brand-black/40">
                          {relTime(h.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-brand-black/55">
                        {h.memory}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    );
  },
};

/** First paint — skeletons matched to the row they become. */
export const Loading: Story = {
  render: () => (
    <div className="min-h-[600px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle label="Memory" title="Memory bank" />
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-72 rounded-xl" />
          <Skeleton className="h-9 w-48 rounded-xl" />
        </div>
        <PanelCard className="mt-4">
          <div className="divide-y divide-brand-black/[0.05]">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="px-6 py-3.5">
                <Skeleton className="h-3.5 w-4/5" />
                <div className="mt-2.5 flex gap-3">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
              </div>
            ))}
          </div>
        </PanelCard>
      </PageBody>
    </div>
  ),
};

/** Nothing ingested yet — the first-run state. */
export const Empty: Story = {
  render: () => (
    <div className="min-h-[500px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle
          label="Memory"
          title="Memory bank"
          description="Every durable fact the engine has extracted, newest first."
        />
        <PanelCard className="mt-6">
          <EmptyState
            icon={Icon.memory}
            title="No memories yet"
            description="Add a document or assert a fact directly, and the engine will start extracting."
            action={
              <Button size="sm" variant="primary">
                <Icon.add size={13} />
                Add memory
              </Button>
            }
          />
        </PanelCard>
      </PageBody>
    </div>
  ),
};

/** The instance is unreachable — a critical-tinted card, not a toast. */
export const BackendUnreachable: Story = {
  render: () => (
    <div className="min-h-[500px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle label="Memory" title="Memory bank" />
        <div className="mt-6 rounded-[28px] border border-[color:var(--color-critical)]/35 bg-card px-6 py-5 shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
          <div className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-critical)]" />
            <span className="label">Instance unreachable</span>
          </div>
          <p className="mt-2.5 max-w-lg text-[13px] leading-relaxed text-brand-black/70">
            No response from{" "}
            <code className="mono">http://localhost:6767/health</code>. The
            console is showing nothing rather than stale data.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline">
              <Icon.refresh size={13} />
              Retry
            </Button>
            <Button size="sm" variant="ghost">
              <Icon.settings size={13} />
              Check settings
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <LoadingState label="Retrying in 5s" />
        </div>
      </PageBody>
    </div>
  ),
};
