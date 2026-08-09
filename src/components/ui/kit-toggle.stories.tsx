import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Toggle } from "@/components/ui";

/**
 * A settings row: switch, label, and an optional hint that explains the
 * consequence rather than restating the label.
 *
 * The whole row is a `<label>`, so the hit area covers the text too — a
 * settings list where only the 36px switch is clickable is a bad settings
 * list. Disabled rows drop to 55% opacity and take `cursor-not-allowed`, and
 * the hint is where you say *why* it is disabled.
 */
const meta = {
  title: "Console Kit/Toggle",
  component: Toggle,
  parameters: { layout: "padded" },
  argTypes: {
    onChange: { table: { disable: true } },
  },
  args: {
    label: "LLM filtering",
    hint: "Run each chunk past the model before extraction.",
    checked: true,
    disabled: false,
    // Stories that need a live switch override this with local state.
    onChange: () => {},
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Playground(args) {
    const [checked, setChecked] = React.useState(args.checked);
    React.useEffect(() => setChecked(args.checked), [args.checked]);
    return (
      <div className="max-w-md">
        <Toggle {...args} checked={checked} onChange={setChecked} />
      </div>
    );
  },
};

/** Without a hint — fine when the label is genuinely self-explanatory. */
export const LabelOnly: Story = {
  args: { hint: undefined },
  render: function LabelOnly(args) {
    const [checked, setChecked] = React.useState(true);
    return (
      <div className="max-w-md">
        <Toggle {...args} checked={checked} onChange={setChecked} />
      </div>
    );
  },
};

/** The hint carries the reason the row cannot be changed. */
export const Disabled: Story = {
  args: {
    disabled: true,
    checked: false,
    label: "Cloud sync",
    hint: "Unavailable while the instance is running in local mode.",
  },
  render: (args) => (
    <div className="max-w-md">
      <Toggle {...args} onChange={() => {}} />
    </div>
  ),
};

/** A real settings group — this is the density the panel is tuned for. */
export const SettingsGroup: Story = {
  render: function SettingsGroup() {
    const [state, setState] = React.useState({
      filter: true,
      summaries: true,
      forgotten: false,
      inference: true,
    });
    const set = (k: keyof typeof state) => (v: boolean) =>
      setState((s) => ({ ...s, [k]: v }));

    return (
      <div className="max-w-xl overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
        <div className="px-6 py-5">
          <div className="label">Instance</div>
          <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
            Extraction
          </h3>
        </div>
        <div className="space-y-1 border-t border-brand-black/[0.05] px-6 py-4">
          <Toggle
            label="LLM filtering"
            hint="Run each chunk past the model before extraction. Slower, and much quieter."
            checked={state.filter}
            onChange={set("filter")}
          />
          <Toggle
            label="Generate summaries"
            hint="One-paragraph summary per document, used by hybrid recall."
            checked={state.summaries}
            onChange={set("summaries")}
          />
          <Toggle
            label="Include forgotten memories in recall"
            hint="Off by default — forgetting is meant to stop a fact resurfacing."
            checked={state.forgotten}
            onChange={set("forgotten")}
          />
          <Toggle
            label="Derive inferences"
            hint="Let the engine assert facts implied by two or more memories."
            checked={state.inference}
            onChange={set("inference")}
          />
        </div>
      </div>
    );
  },
};
