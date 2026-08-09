import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { doc, chunksFor } from "@/stories/fixtures";
import { TYPE_LABEL, relTime } from "@/lib/format";

/**
 * Radix dialog wearing a slide-in panel. The console's detail views are all
 * sheets rather than modals: a memory, a document or a chunk list opens beside
 * the corpus you were reading, so the list keeps its scroll position and you
 * do not lose your place.
 *
 * Product code should reach for **Console Kit / Drawer**, which fixes the side,
 * width and header/body/footer structure. Use this primitive directly only for
 * a panel that genuinely does not fit that shape.
 */
const meta = {
  title: "Primitives/Sheet",
  component: Sheet,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All four sides. `right` is the one the product actually uses. */
export const Sides: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(["right", "left", "top", "bottom"] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button variant="outline">Open {side}</Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>Sheet from {side}</SheetTitle>
              <SheetDescription>
                Slide direction is set by the `side` prop.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  ),
};

/** A real document detail panel, assembled from the seeded corpus. */
export const DocumentDetail: Story = {
  render: () => {
    const chunks = chunksFor(doc).slice(0, 4);
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open document</Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="space-y-1 border-b border-brand-black/[0.06] px-5 py-4 text-left">
            <SheetTitle className="text-sm font-semibold text-brand-black">
              {doc.title ?? "Untitled"}
            </SheetTitle>
            <SheetDescription className="text-xs text-brand-black/55">
              {TYPE_LABEL[doc.type]} · {doc.chunkCount ?? 0} chunks · updated{" "}
              {relTime(doc.updatedAt)}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {doc.summary && (
              <p className="text-[13px] leading-relaxed text-brand-black/70">
                {doc.summary}
              </p>
            )}
            <div className="label mt-5 mb-2">Chunks</div>
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
                    {c.content.slice(0, 220)}
                    {c.content.length > 220 ? "…" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  },
};
