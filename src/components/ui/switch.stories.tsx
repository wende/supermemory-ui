import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Switch } from "@/components/ui/switch";

/**
 * Radix switch. On its own it carries no label, so it is almost never used
 * directly — **Console Kit / Toggle** wraps it with the label, hint and hit
 * area that a settings row needs.
 *
 * A switch means *this takes effect now*. If the change needs a save step, use
 * a checkbox-shaped control or a form instead — a switch that does not apply
 * immediately reads as broken.
 */
const meta = {
  title: "Primitives/Switch",
  component: Switch,
  parameters: { layout: "centered" },
  argTypes: {
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: { checked: true, disabled: false },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Controlled by the args panel. */
export const Playground: Story = {
  render: (args) => <Switch {...args} onCheckedChange={() => {}} />,
};

/** Live, so the thumb transition and focus ring can be checked by hand. */
export const Interactive: Story = {
  render: function Interactive() {
    const [on, setOn] = React.useState(true);
    return <Switch checked={on} onCheckedChange={setOn} />;
  },
};

export const States: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex flex-wrap items-center gap-8">
      {(
        [
          ["Off", false, false],
          ["On", true, false],
          ["Off · disabled", false, true],
          ["On · disabled", true, true],
        ] as const
      ).map(([label, checked, disabled]) => (
        <div key={label} className="flex flex-col items-start gap-2">
          <Switch checked={checked} disabled={disabled} onCheckedChange={() => {}} />
          <span className="text-[11px] text-brand-black/45">{label}</span>
        </div>
      ))}
    </div>
  ),
};
