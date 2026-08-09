import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Slider } from "@/components/ui/slider";

/**
 * A native `<input type="range">` styled to the console palette — thumb and
 * accent in brand black, track in brand black at 8%. Native rather than Radix
 * on purpose: keyboard, touch and screen-reader behaviour come for free, and
 * the control has no states worth re-implementing.
 *
 * Series colours (`--s1`…`--s5`) are for charts and entities only — never for
 * form chrome.
 *
 * The `label` / `hint` pair is the intended shape: name on the left, current
 * value on the right in tabular figures, so the number does not jitter as you
 * drag.
 */
const meta = {
  title: "Primitives/Slider",
  component: Slider,
  parameters: { layout: "padded" },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    onChange: { table: { disable: true } },
  },
  args: {
    label: "Repel force",
    value: 0.45,
    min: 0,
    max: 1,
    step: 0.01,
    // Stories that need a live value override this with local state.
    onChange: () => {},
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Args-driven; drag updates the args panel too. */
export const Playground: Story = {
  render: function Playground(args) {
    const [value, setValue] = React.useState(args.value);
    React.useEffect(() => setValue(args.value), [args.value]);
    return (
      <div className="max-w-xs">
        <Slider
          {...args}
          value={value}
          onChange={setValue}
          hint={value.toFixed(2)}
        />
      </div>
    );
  },
};

/** Without a label it is a bare track — fine inline, wrong in a settings list. */
export const Bare: Story = {
  args: { label: undefined, hint: undefined },
  render: function Bare(args) {
    const [value, setValue] = React.useState(0.6);
    return (
      <div className="max-w-xs">
        <Slider {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};

/** The graph customise panel — six of these stacked, each with a live value. */
export const SettingsStack: Story = {
  render: function SettingsStack() {
    const [values, setValues] = React.useState({
      textFade: 0.35,
      nodeSize: 0.5,
      linkThickness: 0.4,
      centerForce: 0.3,
      repelForce: 0.45,
      linkDistance: 0.55,
    });
    const set = (k: keyof typeof values) => (v: number) =>
      setValues((s) => ({ ...s, [k]: v }));

    return (
      <div className="w-[260px] rounded-xl border border-brand-black/[0.08] bg-card p-3">
        <div className="label mb-1">Display</div>
        <Slider
          label="Text fade threshold"
          hint={values.textFade.toFixed(2)}
          value={values.textFade}
          onChange={set("textFade")}
        />
        <Slider
          label="Node size"
          hint={values.nodeSize.toFixed(2)}
          value={values.nodeSize}
          onChange={set("nodeSize")}
        />
        <Slider
          label="Link thickness"
          hint={values.linkThickness.toFixed(2)}
          value={values.linkThickness}
          onChange={set("linkThickness")}
        />
        <div className="label mt-3 mb-1">Forces</div>
        <Slider
          label="Center force"
          hint={values.centerForce.toFixed(2)}
          value={values.centerForce}
          onChange={set("centerForce")}
        />
        <Slider
          label="Repel force"
          hint={values.repelForce.toFixed(2)}
          value={values.repelForce}
          onChange={set("repelForce")}
        />
        <Slider
          label="Link distance"
          hint={values.linkDistance.toFixed(2)}
          value={values.linkDistance}
          onChange={set("linkDistance")}
        />
      </div>
    );
  },
};
