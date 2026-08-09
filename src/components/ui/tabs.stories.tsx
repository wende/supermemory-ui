import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Radix tabs in the default shadcn dress: a muted tray with a raised active
 * tab. This is the **inline** tab — for switching views inside a panel.
 *
 * For top-level page sections use **Blocks / PillTabList**, which is the same
 * primitive wearing the brand's uppercase pill treatment.
 */
const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="memories" className="max-w-xl">
      <TabsList>
        <TabsTrigger value="memories">Memories</TabsTrigger>
        <TabsTrigger value="chunks">Chunks</TabsTrigger>
        <TabsTrigger value="raw">Raw</TabsTrigger>
      </TabsList>
      <TabsContent value="memories">
        <p className="py-3 text-[13px] text-brand-black/70">
          Four durable facts were extracted from this document.
        </p>
      </TabsContent>
      <TabsContent value="chunks">
        <p className="py-3 text-[13px] text-brand-black/70">
          18 chunks at 1200 tokens, embedded with bge-base-en-v1.5.
        </p>
      </TabsContent>
      <TabsContent value="raw">
        <pre className="mono py-3 text-[11px] leading-relaxed text-brand-black/55">
          {"{\n  \"id\": \"doc_9c1e\",\n  \"status\": \"done\"\n}"}
        </pre>
      </TabsContent>
    </Tabs>
  ),
};

/** Disabled triggers keep their slot so the tray does not resize. */
export const WithDisabled: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="max-w-xl">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="sources" disabled>
          Sources
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="py-3 text-[13px] text-brand-black/70">
          Asserted directly by the user — this memory has no source document,
          which is why Sources is unavailable.
        </p>
      </TabsContent>
      <TabsContent value="history">
        <p className="py-3 text-[13px] text-brand-black/70">
          Three versions, latest 2d ago.
        </p>
      </TabsContent>
    </Tabs>
  ),
};

/** Inside a panel, which is where this variant belongs. */
export const InPanel: Story = {
  render: () => (
    <div className="max-w-xl overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]">
      <div className="px-6 py-5">
        <div className="label">Instance</div>
        <h3 className="mt-1 text-[15px] font-semibold text-brand-black">
          Runtime
        </h3>
      </div>
      <div className="border-t border-brand-black/[0.05] px-6 py-4">
        <Tabs defaultValue="embeddings">
          <TabsList>
            <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
            <TabsTrigger value="llm">LLM</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
          </TabsList>
          <TabsContent value="embeddings">
            <dl className="space-y-1.5 py-3 text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-brand-black/40">Model</dt>
                <dd className="mono text-brand-black/70">bge-base-en-v1.5</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-brand-black/40">Dimensions</dt>
                <dd className="tnum text-brand-black/70">768</dd>
              </div>
            </dl>
          </TabsContent>
          <TabsContent value="llm">
            <dl className="space-y-1.5 py-3 text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-brand-black/40">Model</dt>
                <dd className="mono text-brand-black/70">qwen3:8b</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-brand-black/40">Endpoint</dt>
                <dd className="mono text-brand-black/70">:11434/v1</dd>
              </div>
            </dl>
          </TabsContent>
          <TabsContent value="storage">
            <dl className="space-y-1.5 py-3 text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-brand-black/40">Engine</dt>
                <dd className="text-brand-black/70">embedded graph + hnsw</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-brand-black/40">Size</dt>
                <dd className="tnum text-brand-black/70">303.5 MB</dd>
              </div>
            </dl>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  ),
};
