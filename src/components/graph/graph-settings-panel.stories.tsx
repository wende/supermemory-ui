import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  GraphToolbar,
  GraphCustomizeButton,
} from "@/components/graph/graph-settings-panel";
import { DEFAULT_SETTINGS } from "@/lib/graph/settings";
import type { GraphSettings } from "@/lib/graph/types";
import { SPACES } from "@/stories/fixtures";

/**
 * The graph's controls, split by how often you touch them.
 *
 * **`GraphToolbar`** is the always-visible row: filter query, space, and the
 * two node-class chips. The query input is **debounced by 220ms and held
 * locally** — committing on every keystroke would re-derive the visible set
 * and re-run the force layout synchronously, so the graph would stutter as you
 * type. Refs hold the live `settings` and `onChange` so the timer cannot fire
 * with a stale snapshot.
 *
 * **`GraphCustomizeButton`** hides the rarely-changed knobs — force
 * parameters, node size, colour groups — behind a popover, in line with the
 * system's progressive-disclosure rule.
 *
 * Both are fully controlled: they take `settings` and hand back a complete new
 * object. Nothing is stored inside them except the debounce draft.
 */
const meta: Meta = {
  title: "Graph/Settings",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj;

/** Shared controlled wrapper — every story below drives real settings state. */
function Controlled({
  initial,
  children,
}: {
  initial?: Partial<GraphSettings>;
  children: (
    settings: GraphSettings,
    setSettings: (next: GraphSettings) => void,
  ) => React.ReactNode;
}) {
  const [settings, setSettings] = React.useState<GraphSettings>({
    ...DEFAULT_SETTINGS,
    ...initial,
  });
  return (
    <div>
      {children(settings, setSettings)}
      <pre className="mono mt-6 max-w-xl overflow-x-auto rounded-xl border border-brand-black/[0.06] bg-muted px-3 py-2 text-[10px] leading-relaxed text-brand-black/55">
        {JSON.stringify(
          {
            query: settings.query,
            space: settings.space,
            showDocuments: settings.showDocuments,
            showForgotten: settings.showForgotten,
            localGraph: settings.localGraph,
            localDepth: settings.localDepth,
            colorGroups: settings.colorGroups.length,
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

/** The toolbar at rest. Type in the filter to watch the 220ms commit. */
export const Toolbar: Story = {
  render: function Toolbar() {
    return (
      <Controlled>
        {(settings, setSettings) => (
          <GraphToolbar
            settings={settings}
            onChange={setSettings}
            spaces={SPACES}
            localActive={false}
            onExitLocal={() => {}}
          />
        )}
      </Controlled>
    );
  },
};

/**
 * Local-graph mode adds an escape hatch back to the full graph and a depth
 * slider — the two controls that only make sense while focused on one node.
 */
export const LocalMode: Story = {
  render: function LocalMode() {
    return (
      <Controlled initial={{ localGraph: true, localDepth: 2 }}>
        {(settings, setSettings) => (
          <GraphToolbar
            settings={settings}
            onChange={setSettings}
            spaces={SPACES}
            localActive
            onExitLocal={() => {}}
          />
        )}
      </Controlled>
    );
  },
};

/** Filters already applied — chips fill with brand black when active. */
export const Filtered: Story = {
  render: function Filtered() {
    return (
      <Controlled
        initial={{
          query: "orbital",
          space: SPACES[0].containerTag,
          showDocuments: false,
          showForgotten: true,
        }}
      >
        {(settings, setSettings) => (
          <GraphToolbar
            settings={settings}
            onChange={setSettings}
            spaces={SPACES}
            localActive={false}
            onExitLocal={() => {}}
          />
        )}
      </Controlled>
    );
  },
};

/** The customise popover. Click the sliders button to open it. */
export const CustomizePopover: Story = {
  render: function CustomizePopover() {
    return (
      <Controlled>
        {(settings, setSettings) => (
          // Room below so the upward-opening popover is not clipped.
          <div className="flex min-h-[560px] items-end">
            <GraphCustomizeButton
              settings={settings}
              onChange={setSettings}
              localActive={false}
            />
          </div>
        )}
      </Controlled>
    );
  },
};

/** Toolbar and customise button together, as the graph page arranges them. */
export const FullControlRow: Story = {
  render: function FullControlRow() {
    return (
      <Controlled>
        {(settings, setSettings) => (
          <div className="flex min-h-[560px] flex-col justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-brand-black/[0.06] bg-background/90 px-3 py-2">
              <GraphToolbar
                settings={settings}
                onChange={setSettings}
                spaces={SPACES}
                localActive={settings.localGraph}
                onExitLocal={() =>
                  setSettings({ ...settings, localGraph: false })
                }
                className="min-w-0 flex-1"
              />
              <GraphCustomizeButton
                settings={settings}
                onChange={setSettings}
                localActive={settings.localGraph}
              />
            </div>
          </div>
        )}
      </Controlled>
    );
  },
};
