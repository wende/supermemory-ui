"use client";

import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { AppShell, PageContainer } from "@/components/layouts/app-shell";
import { PageHeader as TemplatePageHeader } from "@/components/blocks/page-header";
import { PageTransition } from "@/components/blocks/page-transition";
import { ServerUnreachableModal } from "@/components/blocks/server-unreachable-modal";
import { ThemeToggle } from "@/components/blocks/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NAV: {
  group: string;
  items: { href: string; label: string; icon: IconName }[];
}[] = [
  {
    group: "",
    items: [{ href: "/", label: "Dashboard", icon: "overview" }],
  },
  {
    group: "Memory",
    items: [
      { href: "/memories", label: "Memory bank", icon: "memory" },
      { href: "/timeline", label: "Timeline", icon: "timeline" },
      { href: "/graph", label: "Graph", icon: "graph" },
      { href: "/profile", label: "Profile", icon: "profile" },
    ],
  },
  {
    group: "Ingest",
    items: [
      { href: "/add", label: "Add memory", icon: "add" },
      { href: "/forget", label: "Forget", icon: "forget" },
      { href: "/documents", label: "Documents", icon: "document" },
      { href: "/spaces", label: "Spaces", icon: "space" },
    ],
  },
  {
    group: "Instance",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/api", label: "API explorer", icon: "terminal" },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const sections = useMemo(
    () =>
      NAV.map((group) => ({
        label: group.group,
        items: group.items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return {
            key: item.href,
            label: item.label,
            icon: Icon[item.icon],
            href: item.href,
            active,
          };
        }),
      })),
    [pathname],
  );

  const breadcrumbs = useMemo(() => {
    const crumbs: { label: string; href?: string }[] = [
      { label: "supermemory", href: "/" },
    ];
    for (const group of NAV) {
      for (const item of group.items) {
        const match =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        if (match && item.href !== "/") {
          crumbs.push({ label: item.label });
          return crumbs;
        }
      }
    }
    if (pathname === "/") crumbs.push({ label: "Dashboard" });
    return crumbs;
  }, [pathname]);

  return (
    <AppShell
      brand={{ eyebrow: "by WENDE", name: "supermemory" }}
      sections={sections}
      header={
        <TemplatePageHeader
          quiet
          breadcrumbs={breadcrumbs}
          actions={<ThemeToggle />}
        />
      }
    >
      {children}
      <ServerUnreachableModal />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

export function PageTitle({
  label,
  title,
  description,
  children,
}: {
  label?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="animate-fade-in flex min-w-0 flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {label ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-black/35">
            {label}
          </div>
        ) : null}
        <div
          className={
            label
              ? "mt-1 flex items-center gap-2"
              : "flex items-center gap-2"
          }
        >
          <h1 className="text-2xl font-semibold tracking-tight text-brand-black">
            {title}
          </h1>
          {description ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`About ${title}`}
                    className="focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full text-brand-black/40 transition-colors hover:bg-brand-black/[0.05] hover:text-brand-black/70"
                  >
                    <Icon.help size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="start"
                  className="max-w-sm border border-brand-black/[0.08] bg-card px-3 py-2 text-[12px] leading-relaxed text-brand-black/70 shadow-[0_12px_32px_rgba(17,17,17,0.12)]"
                >
                  {description}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use PageTitle inside PageBody instead — kept as alias during migration */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <PageTitle title={title} description={description}>
      {children}
    </PageTitle>
  );
}

export function PageBody({
  children,
  className = "",
  maxWidth = "wide",
}: {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "2xl" | "4xl" | "6xl" | "wide";
}) {
  return (
    <PageContainer maxWidth={maxWidth}>
      <PageTransition className={className}>{children}</PageTransition>
    </PageContainer>
  );
}
