import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/icons";

/**
 * The shadcn button, retuned to the console's palette. `default` is the
 * inverted-foreground primary; everything quieter than that (`outline`,
 * `ghost`) is what most chrome should use so the page stays calm.
 *
 * `Button` from `@/components/ui` wraps this one with a `rounded-xl` corner
 * and a friendlier variant vocabulary — see **Console Kit / Button**.
 */
const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
    },
    size: { control: "inline-radio", options: ["default", "sm", "lg", "icon"] },
    disabled: { control: "boolean" },
    asChild: { table: { disable: true } },
  },
  args: {
    children: "Reindex corpus",
    variant: "default",
    size: "default",
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Every variant side by side — the quick contrast check when adding chrome. */
export const Variants: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(
        [
          "default",
          "secondary",
          "outline",
          "ghost",
          "link",
          "destructive",
        ] as const
      ).map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** `sm` is the list-row size, `default` the form size, `lg` the rare hero. */
export const Sizes: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Refresh">
        <Icon.refresh />
      </Button>
    </div>
  ),
};

/** Icons are auto-sized to 16px and made non-interactive by the base class. */
export const WithIcon: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>
        <Icon.add />
        Add memory
      </Button>
      <Button variant="outline">
        <Icon.refresh />
        Refresh
      </Button>
      <Button variant="destructive">
        <Icon.trash />
        Forget
      </Button>
      <Button variant="ghost">
        Open in graph
        <Icon.external />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Primary</Button>
      <Button variant="outline" disabled>
        Outline
      </Button>
      <Button variant="ghost" disabled>
        Ghost
      </Button>
    </div>
  ),
};

/**
 * `asChild` hands the styling to whatever element you pass — the escape hatch
 * for links that need to look like buttons without nesting interactive nodes.
 */
export const AsLink: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <a href="#" className={buttonVariants({ variant: "outline" })}>
      <Icon.external />
      Read the API reference
    </a>
  ),
};
