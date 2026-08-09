import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * The console's button — a thin wrapper over the shadcn primitive that fixes
 * the corner at `rounded-xl` and renames the variants to the vocabulary page
 * code actually thinks in: `primary`, `outline`, `ghost`, `danger`.
 *
 * **`outline` is the default**, and that is a deliberate choice: most buttons
 * in an operator console are secondary chrome. Promoting one to `primary` is a
 * statement that it is *the* action on the screen — a page should rarely have
 * more than one.
 */
const meta = {
  title: "Console Kit/Button",
  component: Button,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "outline", "ghost", "danger"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Add memory",
    variant: "outline",
    size: "md",
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};

/** `sm` is the list-row and toolbar size; `md` is the form size. */
export const Sizes: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="sm" variant="primary">
        <Icon.crosshair size={13} />
        Local graph
      </Button>
    </div>
  ),
};

/**
 * One primary, everything else quiet. This is the intended density for a page
 * header's action cluster.
 */
export const ActionCluster: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm">
        <Icon.refresh size={13} />
        Refresh
      </Button>
      <Button variant="outline" size="sm">
        <Icon.filter size={13} />
        Filter
      </Button>
      <Button variant="primary" size="sm">
        <Icon.add size={13} />
        Add memory
      </Button>
    </div>
  ),
};

/**
 * `danger` is reserved for irreversible work. In practice the console pushes
 * those onto dedicated routes (`/forget`, org reset) rather than putting them
 * next to safe actions.
 */
export const Destructive: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="danger">
        <Icon.trash size={14} />
        Forget matching memories
      </Button>
      <Button variant="danger" disabled>
        <Icon.trash size={14} />
        Reset instance
      </Button>
    </div>
  ),
};
