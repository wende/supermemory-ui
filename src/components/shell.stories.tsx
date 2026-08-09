import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageTitle, PageBody } from "@/components/shell";
import { Button } from "@/components/ui";
import { StatusPill } from "@/components/blocks/status-pill";
import { PanelCard } from "@/components/blocks/panel-card";
import { Icon } from "@/components/icons";
import { recentMemories } from "@/stories/fixtures";
import { relTime } from "@/lib/format";

/**
 * `PageTitle` is the intro every route opens with: optional eyebrow, an H1,
 * an optional help tooltip, and an action cluster pushed to the right.
 *
 * The rule it encodes is worth stating plainly: **there is no subtitle under
 * the H1.** Explanation goes in the help tooltip, which is what the
 * `description` prop renders. Page titles are short nouns — "Memories",
 * "Documents", "Ask" — and the eyebrow says which group of the navigation you
 * are standing in.
 *
 * `PageBody` pairs it with the container and the mount transition, so a route
 * body is `<PageBody><PageTitle …/>…</PageBody>` and nothing else.
 *
 * `Shell` — the component that supplies the real navigation and derives active
 * state from `usePathname()` — is documented in **Layout / AppShell**, which
 * shows the same chrome with static props.
 */
const meta = {
  title: "Layout/PageTitle",
  component: PageTitle,
  parameters: { layout: "padded" },
  args: {
    label: "Recall",
    title: "Memory bank",
    description:
      "Every durable fact the engine has extracted, newest first. Versions are kept — forgetting is a state, not a delete.",
  },
} satisfies Meta<typeof PageTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The four shapes, in the order you meet them. */
export const Variations: Story = {
  render: () => (
    <div className="space-y-10">
      <PageTitle title="Title only" />
      <PageTitle label="Ingest" title="With eyebrow" />
      <PageTitle
        label="Recall"
        title="With help"
        description="The tooltip is where complexity lives. Anything a user needs in order to act belongs on the page itself."
      />
      <PageTitle
        label="Instance"
        title="With actions"
        description="Actions sit right-aligned and wrap onto their own line on narrow viewports."
      >
        <StatusPill variant="solid">Healthy</StatusPill>
        <Button size="sm" variant="ghost">
          <Icon.refresh size={13} />
          Refresh
        </Button>
        <Button size="sm" variant="primary">
          <Icon.add size={13} />
          Add memory
        </Button>
      </PageTitle>
    </div>
  ),
};

/** A complete route body: container, transition, title, panels. */
export const FullPageBody: Story = {
  parameters: { layout: "fullscreen", docs: { story: { height: "600px" } } },
  render: () => (
    <div className="h-[600px] bg-background">
      <PageBody maxWidth="4xl">
        <PageTitle
          label="Recall"
          title="Memory bank"
          description="Every durable fact the engine has extracted, newest first."
        >
          <Button size="sm" variant="outline">
            <Icon.filter size={13} />
            Filter
          </Button>
          <Button size="sm" variant="primary">
            <Icon.add size={13} />
            Add memory
          </Button>
        </PageTitle>

        <PanelCard title="Recently extracted" className="mt-6" stagger>
          {recentMemories.map((m) => (
            <div key={m.id} className="px-6 py-3 first:pt-4">
              <p className="text-[13px] leading-relaxed text-brand-black">
                {m.memory}
              </p>
              <span className="mt-1 block text-[11px] text-brand-black/45">
                {relTime(m.updatedAt)} · {m.sourceCount} sources
              </span>
            </div>
          ))}
        </PanelCard>
      </PageBody>
    </div>
  ),
};

/**
 * The anti-pattern this component exists to prevent: a paragraph of
 * explanation wedged between the H1 and the content.
 */
export const NoSubtitleRule: Story = {
  name: "Subtitle: do / don't",
  render: () => (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <div className="label mb-4">Do — help tooltip</div>
        <PageTitle
          label="Ingest"
          title="Forget"
          description="Forgetting marks a memory inactive and stops it surfacing in recall. Versions are retained, so a forgotten memory can still be audited."
        />
      </div>
      <div>
        <div className="label mb-4">Don&apos;t — subtitle paragraph</div>
        <div>
          <div className="label">Ingest</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-black">
            Forget
          </h1>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-brand-black/55">
            Forgetting marks a memory inactive and stops it surfacing in recall.
            Versions are retained, so a forgotten memory can still be audited.
          </p>
        </div>
      </div>
    </div>
  ),
};
