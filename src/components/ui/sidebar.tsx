"use client";

/**
 * Sidebar — 8claw-style collapsible rail on desktop, detached drawer on mobile.
 *
 * Desktop: gap spacer + fixed panel, so the width animation doesn't reflow
 * <main> every frame; collapsing shrinks it to an icon rail.
 *
 * Mobile (< md): the gap spacer is zero-width and the panel floats above the
 * content as a detached overlay with a scrim. Opening the menu never resizes
 * the page, so content keeps its full width and its scroll position.
 */
import * as React from "react";
import Link from "next/link";
import { Slot } from "@radix-ui/react-slot";
import { Menu, PanelLeftClose, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/lib/use-mobile";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "13rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextProps = {
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
  /** Viewport is below `md` — the sidebar behaves as a detached drawer. */
  isMobile: boolean;
  /** Drawer visibility on mobile, kept apart from the desktop rail state. */
  openMobile: boolean;
  setOpenMobile: (v: boolean | ((prev: boolean) => boolean)) => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

function SidebarProvider({
  children,
  defaultOpen = true,
  className,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, _setOpen] = React.useState(defaultOpen);
  // The drawer starts closed on mobile and is never opened by a resize, so the
  // first paint matches the server render on every viewport.
  const [openMobile, setOpenMobile] = React.useState(false);
  const isMobile = useIsMobile();

  const setOpen = React.useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      _setOpen(value);
    },
    [],
  );

  const toggleSidebar = React.useCallback(() => {
    React.startTransition(() =>
      isMobile ? setOpenMobile((v) => !v) : setOpen((v) => !v),
    );
  }, [isMobile, setOpen]);

  // Leaving the mobile breakpoint retires the drawer rather than leaving an
  // overlay parked on top of a desktop layout.
  React.useEffect(() => {
    if (!isMobile) setOpenMobile(false);
  }, [isMobile]);

  React.useEffect(() => {
    if (!openMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMobile(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMobile]);

  const state: "expanded" | "collapsed" = open ? "expanded" : "collapsed";

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      state,
      toggleSidebar,
      isMobile,
      openMobile,
      setOpenMobile,
    }),
    [open, setOpen, state, toggleSidebar, isMobile, openMobile],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
          } as React.CSSProperties
        }
        className={cn("flex h-svh w-full overflow-hidden", className)}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
  // The icon rail is a desktop affordance; on mobile the drawer is either on
  // screen with its labels or off screen entirely.
  const collapsible = !isMobile && state === "collapsed" ? "icon" : "";

  return (
    <div
      className="group peer text-brand-black"
      data-state={state}
      data-collapsible={collapsible}
      data-mobile-open={openMobile}
      data-slot="sidebar"
    >
      {/* In-flow gap — only this drives main-column resize. Zero-width below
          `md`, which is what keeps the drawer from squeezing the page. */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-0 bg-transparent transition-[width] duration-250 ease-in-out",
          "md:w-52 md:group-data-[collapsible=icon]:w-12",
        )}
      />

      {/* Scrim — mobile only, dismisses the drawer on tap */}
      <div
        data-slot="sidebar-scrim"
        aria-hidden
        onClick={() => setOpenMobile(false)}
        className={cn(
          "fixed inset-0 z-40 bg-brand-black/35 backdrop-blur-[2px] transition-opacity duration-300 md:hidden",
          openMobile ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Visual panel: detached drawer on mobile, fixed rail on desktop */}
      <div
        data-slot="sidebar-container"
        inert={isMobile && !openMobile ? true : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-svh",
          // Mobile: floating panel that slides in over the content
          "w-[17.5rem] max-w-[85vw] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          "transition-transform duration-300 ease-out",
          "-translate-x-full group-data-[mobile-open=true]:translate-x-0",
          // Desktop: in-place rail whose width animates
          "md:z-10 md:w-52 md:max-w-none md:translate-x-0 md:p-0",
          "md:transition-[width] md:duration-250 md:ease-in-out md:will-change-[width]",
          "md:group-data-[collapsible=icon]:w-12",
          className,
        )}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            "relative flex h-full w-full flex-col overflow-x-hidden bg-background text-brand-black",
            // Detached card treatment below `md` only
            "rounded-[24px] border border-brand-black/[0.07] shadow-[0_24px_60px_rgba(17,17,17,0.18)]",
            "md:rounded-none md:border-0 md:shadow-none",
          )}
        >
          {/* The scrim covers the header trigger, so the drawer carries its
              own dismiss control on mobile. */}
          <button
            type="button"
            onClick={() => setOpenMobile(false)}
            aria-label="Close menu"
            className="absolute top-4 right-3 z-10 flex size-9 items-center justify-center rounded-full text-brand-black/50 transition-colors hover:bg-brand-black/[0.05] hover:text-brand-black md:hidden"
          >
            <X className="size-4" />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Extra right padding below `md` keeps the brand clear of the drawer's
        // close button.
        "flex shrink-0 items-center px-5 pr-14 pb-5 pt-6 transition-[padding] duration-250 ease-in-out md:pr-5",
        "group-data-[collapsible=icon]:px-0.5 group-data-[collapsible=icon]:pb-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SidebarContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 pt-5 transition-[padding] duration-250 ease-in-out",
        "group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:px-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SidebarFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-auto shrink-0 px-4 py-3.5 transition-[padding] duration-250 ease-in-out",
        "group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SidebarGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 px-1 transition-[padding,margin] duration-250 ease-in-out",
        "group-data-[collapsible=icon]:mb-2 group-data-[collapsible=icon]:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SidebarGroupLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.24em] text-brand-black/24",
        "[transition:margin_250ms_ease-in-out,opacity_75ms_ease-in-out_175ms]",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SidebarMenu({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-col items-stretch gap-1.5",
        "group-data-[collapsible=icon]:items-start",
        className,
      )}
    >
      {children}
    </ul>
  );
}

function SidebarMenuItem({ children }: { children: React.ReactNode }) {
  return <li className="relative w-full">{children}</li>;
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const stateClasses = isActive
    ? "!bg-brand-black/[0.07] !text-brand-black hover:!bg-brand-black/[0.10] hover:!text-brand-black"
    : "text-brand-black/58 hover:bg-brand-black/[0.03] hover:text-brand-black/82 active:!bg-brand-black/[0.07] active:!text-brand-black";

  const base = cn(
    "flex w-full items-center gap-3 overflow-hidden",
    "h-11 rounded-xl px-4",
    "transition-[width,height,padding,border-radius,gap] duration-250 ease-in-out",
    "group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!gap-0 group-data-[collapsible=icon]:!px-3 group-data-[collapsible=icon]:rounded-2xl",
    "[&>span:last-child]:truncate",
    stateClasses,
    className,
  );
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={base} {...props}>
      {children}
    </Comp>
  );
}

function SidebarTrigger({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar, state, isMobile, openMobile } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={isMobile ? "Open menu" : "Toggle sidebar"}
      aria-expanded={isMobile ? openMobile : state === "expanded"}
      data-state={state}
      className={cn(
        "-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-brand-black/[0.03] hover:text-foreground md:ml-0 md:size-7 md:rounded-md",
        className,
      )}
      {...props}
    >
      {/* Below `md` the control opens a drawer, so it reads as a menu button. */}
      <Menu className="size-5 md:hidden" />
      <PanelLeftClose
        className={cn(
          "hidden size-4 transition-transform duration-250 md:block",
          state === "collapsed" && "rotate-180",
        )}
      />
    </button>
  );
}

export {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
};

export type SidebarItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  target?: string;
  active?: boolean;
};

export function SidebarNavItem({ item }: { item: SidebarItem }) {
  const { setOpenMobile } = useSidebar();
  const isLink = !!item.href;
  const isAnchor = !!item.target;
  const useAsChild = isLink || isAnchor;
  const icon = (
    <item.icon
      className={cn(
        "size-4 shrink-0",
        item.active ? "opacity-90" : "opacity-45",
      )}
    />
  );
  // Keep label in DOM — fade via button overflow rather than display:none
  const label = (
    <span className="truncate text-[13px] font-medium">{item.label}</span>
  );

  // Picking a destination dismisses the mobile drawer — a menu that stayed
  // open over the page it just navigated to would hide the result.
  function closeDrawer() {
    setOpenMobile(false);
  }

  function handleAnchorClick(e: React.MouseEvent) {
    closeDrawer();
    if (!item.target) return;
    const el = document.getElementById(item.target);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof history !== "undefined") {
      history.replaceState(null, "", `#${item.target}`);
    }
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild={useAsChild} isActive={item.active}>
        {isLink ? (
          <Link href={item.href!} onClick={closeDrawer}>
            {icon}
            {label}
          </Link>
        ) : isAnchor ? (
          <a href={`#${item.target}`} onClick={handleAnchorClick}>
            {icon}
            {label}
          </a>
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
