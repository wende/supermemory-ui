import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageHeader } from "@/components/blocks/page-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/blocks/theme-toggle";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * The sticky top bar inside the main column: sidebar trigger, a hairline
 * separator, the breadcrumb, then right-aligned actions.
 *
 * **`quiet` is what the app uses.** The default (`quiet={false}`) adds a
 * bottom border and a backdrop blur, which is only worth its weight when
 * content genuinely scrolls beneath the bar. The console's page container
 * scrolls independently, so the quiet variant is correct nearly everywhere.
 *
 * Breadcrumbs always start at `supermemory` and go at most one level deep —
 * the last crumb is the current page and is never a link.
 *
 * It reads sidebar state through context, so it must be rendered inside a
 * `SidebarProvider`.
 */
const meta = {
  title: "Layout/PageHeader",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <SidebarProvider>
        <div className="flex-1 bg-background">
          <Story />
          <div className="px-6 py-6 text-[13px] text-brand-black/45">
            Page content starts here.
          </div>
        </div>
      </SidebarProvider>
    ),
  ],
  args: {
    breadcrumbs: [{ label: "supermemory", href: "/" }, { label: "Memory bank" }],
    quiet: true,
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What the app ships: no border, no blur. */
export const Quiet: Story = {};

/** Bordered and blurred — for a bar that content passes under. */
export const Bordered: Story = {
  args: { quiet: false },
};

/** With actions. The theme toggle is the app's only permanent one. */
export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button size="sm" variant="ghost">
          <Icon.refresh size={13} />
          Refresh
        </Button>
        <ThemeToggle />
      </>
    ),
  },
};

/** Root — a single crumb, unlinked. */
export const AtRoot: Story = {
  args: {
    breadcrumbs: [{ label: "supermemory", href: "/" }, { label: "Dashboard" }],
    actions: <ThemeToggle />,
  },
};

/** Deeper trails work, but the console deliberately stays at two levels. */
export const DeepTrail: Story = {
  args: {
    breadcrumbs: [
      { label: "supermemory", href: "/" },
      { label: "Spaces", href: "/spaces" },
      { label: "Orbital" },
    ],
  },
};
