import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarNavItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  type SidebarItem,
} from "@/components/ui/sidebar";
import { Icon } from "@/components/icons";

/**
 * The collapsible rail. Two details are load-bearing and easy to lose in a
 * rewrite:
 *
 * 1. **The gap spacer.** The visible panel is `position: fixed`; an in-flow
 *    sibling of the same width is what the main column actually reacts to. If
 *    the panel itself were in flow, every animation frame would reflow the
 *    page.
 * 2. **Labels stay in the DOM.** Collapsing animates `max-width` and opacity
 *    rather than switching to `display: none`, so the text slides away instead
 *    of popping, and assistive tech keeps a stable tree.
 *
 * Expanded is `13rem`, the icon rail is `3rem`, and the transition is 250ms.
 */
const meta = {
  title: "Layout/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
    docs: {
      story: { height: "520px" },
    },
  },
  // The rail is always rendered inside a provider by the stories below.
  args: { children: null },
} satisfies Meta<typeof Sidebar>;

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

function Rail() {
  return (
    <Sidebar className="overflow-x-hidden">
      <SidebarHeader>
        <div className="flex h-11 w-full items-center rounded-2xl p-0 group-data-[collapsible=icon]:justify-center">
          <span
            aria-hidden
            className="hidden size-10 items-center justify-center font-[family-name:var(--font-brand)] text-[1.35rem] font-[200] tracking-tight text-brand-black group-data-[collapsible=icon]:flex"
          >
            s
          </span>
          <div className="min-w-0 flex-1 overflow-hidden leading-none whitespace-nowrap transition-[max-width,opacity] duration-250 ease-in-out group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-black/22">
              by WENDE
            </div>
            <span className="mt-1.5 block font-[family-name:var(--font-brand)] text-[1.25rem] font-[200] tracking-tight text-brand-black">
              supermemory
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarNavItem key={item.key} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

/** Expanded — the default. Use the trigger in the header to collapse it. */
export const Expanded: Story = {
  render: () => (
    <SidebarProvider defaultOpen>
      <Rail />
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-14 items-center gap-3 px-6">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <span className="text-[13px] text-muted-foreground">supermemory</span>
          <span className="text-[13px] text-muted-foreground/30">/</span>
          <span className="text-[13px] font-medium text-foreground">
            Memory bank
          </span>
        </header>
        <div className="px-6 py-4 text-[13px] text-brand-black/45">
          Toggle the rail — only the in-flow gap spacer resizes this column.
        </div>
      </main>
    </SidebarProvider>
  ),
};

/** The `3rem` icon rail: monogram, glyphs, no group labels. */
export const IconRail: Story = {
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <Rail />
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-14 items-center gap-3 px-6">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <span className="text-[13px] font-medium text-foreground">
            Memory bank
          </span>
        </header>
        <div className="px-6 py-4 text-[13px] text-brand-black/45">
          Group labels collapse to zero height rather than unmounting, so the
          glyphs do not jump as the rail narrows.
        </div>
      </main>
    </SidebarProvider>
  ),
};

/** With a footer — the slot for instance status or a version line. */
export const WithFooter: Story = {
  render: function WithFooter() {
    return (
      <SidebarProvider defaultOpen>
        <Sidebar>
          <SidebarHeader>
            <span className="font-[family-name:var(--font-brand)] text-[1.25rem] font-[200] tracking-tight text-brand-black">
              supermemory
            </span>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Memory</SidebarGroupLabel>
              <SidebarMenu>
                {SECTIONS[0].items.map((item) => (
                  <SidebarNavItem key={item.key} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-2 text-[11px] text-brand-black/45">
              <span className="size-1.5 rounded-full bg-[color:var(--color-good)]" />
              <span className="mono truncate">localhost:6767</span>
            </div>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 bg-background" />
      </SidebarProvider>
    );
  },
};

/**
 * `useSidebar()` exposes the open state to anything inside the provider — the
 * escape hatch for chrome that needs to know how wide the rail currently is.
 */
export const ReadingState: Story = {
  render: function ReadingState() {
    function StateReadout() {
      const { state, open, toggleSidebar } = useSidebar();
      return (
        <div className="px-6 py-4">
          <button
            type="button"
            onClick={toggleSidebar}
            className="focus-ring rounded-xl border border-brand-black/[0.12] px-3 py-2 text-[13px] text-brand-black transition-colors hover:bg-brand-black/[0.03]"
          >
            Toggle from anywhere
          </button>
          <pre className="mono mt-3 text-[11px] text-brand-black/55">
            {JSON.stringify({ state, open }, null, 2)}
          </pre>
        </div>
      );
    }
    return (
      <SidebarProvider defaultOpen>
        <Rail />
        <main className="flex-1 bg-background">
          <StateReadout />
        </main>
      </SidebarProvider>
    );
  },
};
