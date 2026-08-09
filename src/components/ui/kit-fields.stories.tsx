import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SPACES } from "@/stories/fixtures";

/**
 * `Input`, `Textarea` and `Select` share one `fieldBase`: `rounded-xl`, a 12%
 * brand-black border, card ground, and a focus state that swaps the border to
 * `--ring` and adds a 2px ring at 30%.
 *
 * They are unlabelled on purpose — the console pairs them with a `.label`
 * eyebrow or a `<label>` in the surrounding form rather than baking a label
 * slot into the primitive. Every field in a real form needs one.
 *
 * `Select` carries its chevron as an inline `background-image` rather than a
 * Tailwind class, so a `bg-*` utility on the element cannot wipe the
 * background-position and park the icon in the top-left corner.
 */
const meta = {
  title: "Console Kit/Fields",
  component: Input,
  parameters: { layout: "padded" },
  args: { placeholder: "Search memories…" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InputField: Story = {
  name: "Input",
  render: (args) => (
    <div className="max-w-sm">
      <Input {...args} />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="label mb-1.5 block">Empty</span>
        <Input placeholder="sm_research" />
      </label>
      <label className="block">
        <span className="label mb-1.5 block">Filled</span>
        <Input defaultValue="replay correctness" />
      </label>
      <label className="block">
        <span className="label mb-1.5 block">Disabled</span>
        <Input
          disabled
          defaultValue="locked while indexing"
          className="opacity-55"
        />
      </label>
      <label className="block">
        <span className="label mb-1.5 block">Read-only / mono</span>
        <Input readOnly className="mono" value="mem_7f3a91c04e2b8d5a" />
      </label>
    </div>
  ),
};

/** Textarea keeps `resize-y` — vertical only, so it cannot break a layout. */
export const TextareaField: Story = {
  name: "Textarea",
  render: () => (
    <div className="max-w-xl">
      <label className="block">
        <span className="label mb-1.5 block">Filter prompt</span>
        <Textarea
          rows={5}
          defaultValue={
            "Keep durable facts, decisions with rationale, measured numbers and ownership. Drop scheduling logistics, pleasantries and anything that will be false next week."
          }
        />
        <span className="mt-1.5 block text-[11px] text-brand-black/45">
          Applied before chunking — excluded content never reaches the embedder.
        </span>
      </label>
    </div>
  ),
};

export const SelectField: Story = {
  name: "Select",
  render: () => (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="label mb-1.5 block">Space</span>
        <Select defaultValue={SPACES[0].containerTag}>
          <option value="">All spaces</option>
          {SPACES.map((s) => (
            <option key={s.containerTag} value={s.containerTag}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className="label mb-1.5 block">Search mode</span>
        <Select defaultValue="hybrid">
          <option value="memories">Memories</option>
          <option value="hybrid">Hybrid</option>
          <option value="documents">Documents</option>
        </Select>
      </label>
    </div>
  ),
};

/** A whole form, which is the only way to judge the vertical rhythm. */
export const CompleteForm: Story = {
  render: function CompleteForm() {
    const [text, setText] = React.useState("");
    return (
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-xl overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]"
      >
        <div className="px-6 py-5">
          <div className="label">Ingest</div>
          <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
            Add memory
          </h3>
          <p className="mt-1 text-[11px] text-brand-black/45">
            Written straight to the engine as an asserted fact — no extraction
            pass.
          </p>
        </div>
        <div className="space-y-4 border-t border-brand-black/[0.05] px-6 py-5">
          <label className="block">
            <span className="label mb-1.5 block">Memory</span>
            <Textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="I don't take meetings before 10 — mornings are for deep work."
            />
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Space</span>
            <Select defaultValue={SPACES[0].containerTag}>
              {SPACES.map((s) => (
                <option key={s.containerTag} value={s.containerTag}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Custom ID</span>
            <Input className="mono" placeholder="optional" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="reset">
              Clear
            </Button>
            <Button variant="primary" size="sm" type="submit">
              <Icon.add size={13} />
              Add memory
            </Button>
          </div>
        </div>
      </form>
    );
  },
};
