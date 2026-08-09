"use client";

/**
 * AppShell — quiet 8claw-style layout: blended sidebar + main content.
 */
import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarNavItem,
  SidebarProvider,
  type SidebarItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

interface AppShellProps {
  brand: { eyebrow?: string; name: string };
  sections: SidebarSection[];
  header?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function AppShell({
  brand,
  sections,
  header,
  children,
  defaultOpen = true,
}: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar className="overflow-x-hidden">
        <SidebarHeader>
          <a
            href="/"
            aria-label="Home"
            className="flex h-11 w-full items-center rounded-2xl p-0 group-data-[collapsible=icon]:justify-center"
          >
            {/* Icon-rail monogram — only visible when collapsed */}
            <span
              aria-hidden
              className="hidden size-10 items-center justify-center font-[family-name:var(--font-brand)] text-[1.35rem] font-[200] tracking-tight text-brand-black group-data-[collapsible=icon]:flex"
            >
              s
            </span>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-none transition-[max-width,opacity] duration-250 ease-in-out group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none">
              {brand.eyebrow ? (
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-black/22">
                  {brand.eyebrow}
                </div>
              ) : null}
              <span className="mt-1.5 block font-[family-name:var(--font-brand)] text-[1.25rem] font-[200] tracking-tight text-brand-black">
                {brand.name}
              </span>
            </div>
          </a>
        </SidebarHeader>

        <SidebarContent>
          {sections.map((section) => (
            <SidebarGroup key={section.label || section.items[0]?.key || "top"}>
              {section.label ? (
                <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              ) : null}
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarNavItem key={item.key} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </SidebarProvider>
  );
}

const maxWidthClass = {
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
  wide: "max-w-[1400px]",
} as const;

export function PageContainer({
  children,
  maxWidth = "wide",
  className,
}: {
  children: React.ReactNode;
  maxWidth?: keyof typeof maxWidthClass;
  className?: string;
}) {
  return (
    // The whole shell is height-locked (`h-svh` + `overflow-hidden` above), so
    // this is the element that has to scroll — on every viewport, not just
    // `md` and up, or mobile content is simply clipped.
    <div className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-background">
      <div
        className={cn(
          "mx-auto w-full min-w-0 px-4 pt-6 pb-[calc(12dvh+env(safe-area-inset-bottom))] sm:px-6 md:pt-8 md:pb-8 lg:px-8",
          maxWidthClass[maxWidth],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
