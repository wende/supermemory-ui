import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppShell, PageContainer } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { ThemeToggle } from "@/components/blocks/theme-toggle";
import { PanelCard } from "@/components/blocks/panel-card";
import { Stat } from "@/components/charts";
import { Icon } from "@/components/icons";
import type { SidebarItem } from "@/components/ui/sidebar";
import { compact, relTime } from "@/lib/format";
import { counts, recentMemories } from "@/stories/fixtures";

/**
 * The whole chrome in one component: brand block, grouped navigation, a
 * header slot and the main column.
 *
 * Navigation is grouped by **operator intent**, not by API version — Memory
 * (read what the engine knows), Ingest (write and organise), Instance (operate
 * the box). A new screen belongs to whichever verb the user arrived with.
 *
 * `PageContainer` is the second half: it centres the content, caps the width,
 * and adds `12dvh` of bottom padding so a long list clears the fold instead of
 * ending flush against the viewport edge.
 *
 * `AppShell` is layout only — the app wraps it in `Shell`
 * (`src/components/shell.tsx`), which supplies the real nav and derives active
 * state and breadcrumbs from the route.
 */
const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  parameters: {
    layout: "fullscreen",
    docs: { story: { height: "620px" } },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const SECTIONS: { label: string; items: SidebarItem[] }[] = [
  {
    label: "Memory",
    items: [
      { key: "memories", label: "Memory bank", icon: Icon.memory, active: true },
      { key: "graph", label: "Graph", icon: Icon.graph },
      { key: "profile", label: "Profile", icon: Icon.profile },
    ],
  },
  {
    label: "Ingest",
    items: [
      { key: "add", label: "Add memory", icon: Icon.add },
      { key: "forget", label: "Forget", icon: Icon.forget },
      { key: "documents", label: "Documents", icon: Icon.document },
      { key: "spaces", label: "Spaces", icon: Icon.space },
    ],
  },
  {
    label: "Instance",
    items: [
      { key: "settings", label: "Settings", icon: Icon.settings },
      { key: "api", label: "API explorer", icon: Icon.terminal },
      { key: "dashboard", label: "Dashboard", icon: Icon.overview },
    ],
  },
];

const BRAND = { eyebrow: "by WENDE", name: "supermemory" };

function Content() {
  return (
    <>
      <div className="animate-fade-in">
        <div className="label">Recall</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-black">
          Memory bank
        </h1>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Memories"
          value={compact(counts.memories)}
          hint={`${counts.relations} relations`}
          accent="var(--color-s3)"
        />
        <Stat
          label="Documents"
          value={compact(counts.documents)}
          hint={`${compact(counts.chunks)} chunks`}
          accent="var(--color-s1)"
        />
        <Stat
          label="Spaces"
          value={counts.spaces}
          hint="container tags"
          accent="var(--color-s2)"
        />
      </div>
      <PanelCard
        eyebrow="Recall"
        title="Recently extracted"
        className="mt-3"
        stagger
      >
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
    </>
  );
}

/** The full shell, exactly as the app assembles it. */
export const Default: Story = {
  args: {
    brand: BRAND,
    sections: SECTIONS,
    header: (
      <PageHeader
        quiet
        breadcrumbs={[
          { label: "supermemory", href: "/" },
          { label: "Memory bank" },
        ]}
        actions={<ThemeToggle />}
      />
    ),
    children: (
      <PageContainer>
        <Content />
      </PageContainer>
    ),
  },
};

/** Starting collapsed — the icon rail, with the monogram in the brand slot. */
export const CollapsedRail: Story = {
  args: { ...Default.args, defaultOpen: false },
};

/** Without a header, for a route that owns its own top chrome (the graph does). */
export const NoHeader: Story = {
  args: { ...Default.args, header: undefined },
};

/**
 * `PageContainer` widths. `wide` (1400px) is the default and suits lists and
 * dashboards; the narrower caps are for reading and forms, where a full-width
 * measure would be uncomfortable.
 */
export const ContainerWidths: Story = {
  args: {
    ...Default.args,
    header: (
      <PageHeader
        quiet
        breadcrumbs={[{ label: "supermemory", href: "/" }, { label: "Add memory" }]}
      />
    ),
    children: (
      <PageContainer maxWidth="2xl">
        <div className="label">Ingest</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-brand-black">
          Add memory
        </h1>
        <PanelCard
          title="Why this is narrow"
          subtitle="maxWidth=&quot;2xl&quot;"
          className="mt-6"
        >
          <div className="px-6 pt-4 text-[13px] leading-relaxed text-brand-black/70">
            Forms and prose get <code className="mono">2xl</code> /{" "}
            <code className="mono">4xl</code> so the measure stays readable.
            Lists, tables and dashboards get <code className="mono">wide</code>,
            which caps at 1400px and centres.
          </div>
        </PanelCard>
      </PageContainer>
    ),
  },
};
