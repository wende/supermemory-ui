"use client";

/**
 * PillTabList — the brand pill tab group with rounded-[22px] white background,
 * uppercase tracking-[0.16em] labels, and contrast-filled active state.
 *
 * Built on Radix Tabs. Use it for top-level dashboard sections.
 */
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const triggerClass = cn(
  "shrink-0 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-black/55",
  "sm:min-w-[116px] sm:px-5",
  "transition-all duration-200",
  "data-[state=active]:bg-brand-black data-[state=active]:text-background",
  "data-[state=active]:shadow-lg data-[state=active]:shadow-brand-black/15",
);

interface PillTab {
  value: string;
  label: string;
  content: React.ReactNode;
}

export function PillTabList({ tabs }: { tabs: PillTab[] }) {
  return (
    <Tabs defaultValue={tabs[0]?.value} className="w-full gap-0">
      {/* `max-w-full` + horizontal scroll keeps the group on one line on a
          phone; wrapping left a lone tab centred under the others. */}
      <div className="mb-6 flex justify-center sm:mb-8">
        <TabsList
          className={cn(
            "scrollbar-hide h-auto max-w-full justify-start gap-2 overflow-x-auto rounded-[22px] border border-brand-black/[0.06] bg-card/90 p-2",
            "sm:flex-wrap sm:justify-center sm:overflow-visible",
            "shadow-[0_18px_45px_rgba(17,17,17,0.05)] backdrop-blur-sm",
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className={triggerClass}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
