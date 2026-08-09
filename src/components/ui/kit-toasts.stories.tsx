import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button, useToasts } from "@/components/ui";

/**
 * `useToasts()` is a hook, not a component: it returns `{ push, view }`. Drop
 * `view` anywhere in the tree and call `push(text, tone)` to add one. Toasts
 * self-dismiss after 4.2 seconds.
 *
 * They are bottom-centre, `pointer-events-none`, and carry `role="status"` —
 * announced politely rather than interrupting. That is the right register for
 * *what just happened*, and the wrong one for anything the user has to act on:
 * an error that needs a decision belongs in the page, not in a chip that
 * disappears.
 *
 * Tones map to the reserved status palette (`--good`, `--critical`) with a
 * neutral third for plain acknowledgements.
 */
const meta: Meta = {
  title: "Console Kit/Toasts",
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj;

export const Tones: Story = {
  render: function Tones() {
    const { push, view } = useToasts();
    return (
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => push("Memory added to Research", "good")}
        >
          Success
        </Button>
        <Button
          variant="danger"
          onClick={() => push("Ingestion failed — embedder unreachable", "critical")}
        >
          Failure
        </Button>
        <Button onClick={() => push("Copied document ID")}>Neutral</Button>
        {view}
      </div>
    );
  },
};

/** They stack upward, newest at the bottom, and expire independently. */
export const Stacking: Story = {
  render: function Stacking() {
    const { push, view } = useToasts();
    return (
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => {
            push("Queued 3 documents");
            push("Extracting RFC-014.md", "good");
            push("Chunk 18/18 embedded", "good");
            push("One document failed to parse", "critical");
          }}
        >
          Push four at once
        </Button>
        {view}
      </div>
    );
  },
};
