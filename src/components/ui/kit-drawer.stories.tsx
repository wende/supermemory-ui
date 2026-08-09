import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge, Button, Copyable, Drawer } from "@/components/ui";
import { Icon } from "@/components/icons";
import { memory, doc, chunksFor } from "@/stories/fixtures";
import { TYPE_LABEL, relTime, shortDate } from "@/lib/format";

/**
 * The right-hand detail panel. `Drawer` fixes what the `Sheet` primitive
 * leaves open: side `right`, `max-w-xl`, and a three-part structure —
 * bordered header, scrolling body, optional footer.
 *
 * That structure is the contract. The body is the only scrolling region, so a
 * long chunk list never pushes the title or the actions out of reach.
 *
 * It is controlled: `open` plus `onClose`. Radix calls `onClose` for the
 * escape key, the overlay click and the close button alike, so there is one
 * dismissal path to handle.
 */
const meta = {
  title: "Console Kit/Drawer",
  component: Drawer,
  parameters: { layout: "centered" },
  argTypes: {
    onClose: { table: { disable: true } },
    children: { table: { disable: true } },
  },
  // Every story below drives the drawer itself; these only satisfy the
  // component's required props so the arg types stay inferred.
  args: {
    open: false,
    onClose: () => {},
    title: "Memory",
    children: null,
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A memory: flags, metadata, version history, and the actions on it. */
export const MemoryDetail: Story = {
  render: function MemoryDetail() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open memory
        </Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title={memory.memory}
          subtitle={`v${memory.version} · ${memory.sourceCount} sources · updated ${relTime(memory.updatedAt)}`}
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
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-[11px] text-brand-black/35">
                v{memory.version}
              </span>
              {memory.isStatic && <Badge tone="s3">asserted</Badge>}
              {memory.isInference && <Badge tone="s2">inferred</Badge>}
              {memory.isForgotten && <Badge tone="critical">forgotten</Badge>}
            </div>

            <div>
              <div className="label mb-2">Identity</div>
              <Copyable value={memory.id} className="text-brand-black/55" />
            </div>

            {memory.temporalContext && (
              <div>
                <div className="label mb-2">Temporal context</div>
                <p className="text-[12px] leading-relaxed text-brand-black/55">
                  {memory.temporalContext.validFrom &&
                    `Holds from ${shortDate(memory.temporalContext.validFrom)}. `}
                  {memory.temporalContext.note}
                </p>
              </div>
            )}

            {(memory.memoryRelations?.length ?? 0) > 0 && (
              <div>
                <div className="label mb-2">Relations</div>
                <ul className="space-y-1.5">
                  {memory.memoryRelations?.map((r) => (
                    <li
                      key={`${r.relation}-${r.targetId}`}
                      className="flex items-center gap-2 text-[12px]"
                    >
                      <Badge tone="s5">{r.relation}</Badge>
                      <span className="mono truncate text-brand-black/45">
                        {r.targetId}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="label mb-2">History</div>
              <ol className="space-y-2">
                {memory.history.map((h) => (
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
        </Drawer>
      </>
    );
  },
};

/** A document: the long-body case, so the header stays pinned while chunks scroll. */
export const DocumentChunks: Story = {
  render: function DocumentChunks() {
    const [open, setOpen] = React.useState(false);
    const chunks = chunksFor(doc);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open document</Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title={doc.title ?? "Untitled"}
          subtitle={`${TYPE_LABEL[doc.type]} · ${chunks.length} chunks · ingested ${relTime(doc.createdAt)}`}
        >
          <div className="space-y-2">
            {chunks.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-brand-black/[0.06] bg-muted px-3 py-2.5"
              >
                <div className="mono mb-1 text-[10px] text-brand-black/40">
                  #{c.position} · {c.tokens ?? 0} tokens
                </div>
                <p className="text-[12px] leading-relaxed text-brand-black/70">
                  {c.content}
                </p>
              </div>
            ))}
          </div>
        </Drawer>
      </>
    );
  },
};

/** Open on mount, so the panel itself is what the docs page shows. */
export const AlwaysOpen: Story = {
  parameters: { layout: "fullscreen", docs: { story: { height: "520px" } } },
  render: function AlwaysOpen() {
    return (
      <Drawer
        open
        onClose={() => {}}
        title="Research corpus must not leave the machine"
        subtitle="v1 · 2 sources · asserted"
        footer={
          <Button size="sm" variant="ghost" className="w-full">
            <Icon.clock size={13} />
            Version history
          </Button>
        }
      >
        <p className="text-[13px] leading-relaxed text-brand-black/70">
          Security approval for the local backend is conditional on a local LLM
          endpoint. This memory is asserted rather than extracted, so it has no
          parent document and will not be superseded by an extraction pass.
        </p>
      </Drawer>
    );
  },
};
