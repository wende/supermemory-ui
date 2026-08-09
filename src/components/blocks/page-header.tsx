"use client";

/**
 * PageHeader — sticky top bar with sidebar trigger, breadcrumb, and right actions.
 * Used inside <AppShell>'s main area.
 */
import * as React from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Breadcrumb = { label: string; href?: string };

interface PageHeaderProps {
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  className?: string;
  /** No border / blur — matches 8claw's airy sticky bar. */
  quiet?: boolean;
}

export function PageHeader({
  breadcrumbs = [{ label: "Home" }, { label: "Dashboard" }],
  actions,
  className,
  quiet = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 px-4 sm:px-6",
        quiet
          ? "bg-background"
          : "border-b border-border/60 bg-background/80 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <SidebarTrigger className="text-muted-foreground transition-colors duration-200 hover:text-foreground" />
        <Separator orientation="vertical" className="hidden h-4 opacity-40 sm:block" />
        <div className="flex min-w-0 items-center gap-1.5">
          {breadcrumbs.map((segment, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span
                key={i}
                className={cn(
                  "items-center gap-1.5",
                  // Narrow screens keep only the current page — the trail costs
                  // more width than it earns next to a 40px menu button.
                  isLast ? "flex min-w-0" : "hidden sm:flex",
                )}
              >
                {i > 0 && (
                  <span className="hidden text-[13px] text-muted-foreground/30 sm:inline">
                    /
                  </span>
                )}
                {!isLast && segment.href ? (
                  <Link
                    href={segment.href}
                    className="text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    {segment.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "truncate text-[13px]",
                      isLast
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {segment.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}
