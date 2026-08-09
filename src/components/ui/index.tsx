"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton as ShadcnSkeleton } from "@/components/ui/skeleton";
import { Spinner as ShadcnSpinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/blocks/empty-state";
import { Icon } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePageVisible } from "@/lib/query";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
};

const variantMap = {
  primary: "default",
  ghost: "ghost",
  outline: "outline",
  danger: "destructive",
} as const;

const sizeMap = {
  sm: "sm",
  md: "default",
} as const;

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...rest
}: ButtonProps) {
  return (
    <ShadcnButton
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={cn("rounded-xl", className)}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

// 16px below `sm` is deliberate: iOS Safari zooms the viewport when a field
// with a smaller font takes focus, and it never zooms back out. Compact sizes
// are re-applied from `sm` up, where that behaviour doesn't exist.
const fieldBase =
  "w-full rounded-xl border border-brand-black/[0.12] bg-card px-3 py-2 text-base text-brand-black placeholder:text-brand-black/40 outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 sm:text-sm";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={cn(fieldBase, "h-9", className)} {...rest} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { className = "", ...rest } = props;
  return <textarea className={cn(fieldBase, "resize-y", className)} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <select
      className={cn(
        fieldBase,
        "h-9 cursor-pointer appearance-none pr-8",
        className,
      )}
      style={{
        // Keep chevron in inline style so Tailwind `bg-*` classes (e.g. bg-card)
        // cannot wipe background-position/size and park the icon at top-left.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5L6 8l3.5-3.5' stroke='%23888888' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
        backgroundSize: "12px",
        ...style,
      }}
      {...rest}
    />
  );
}

export { Slider } from "@/components/ui/slider";

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 py-1.5",
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
      )}
    >
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm text-brand-black">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-xs text-brand-black/55">{hint}</span>
        )}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-fade-in overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  meta,
  description,
  action,
}: {
  title: string;
  meta?: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-brand-black/[0.05] px-6 py-5">
      <div className="flex min-w-0 items-baseline gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-brand-black">
            {title}
          </h2>
          {description && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`About ${title}`}
                    className="focus-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full text-brand-black/40 transition-colors hover:bg-brand-black/[0.05] hover:text-brand-black/70"
                  >
                    <Icon.help size={13} />
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
          )}
        </div>
        {meta && (
          <span className="shrink-0 text-xs text-brand-black/55">{meta}</span>
        )}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?:
    | "neutral"
    | "good"
    | "warning"
    | "critical"
    | "s1"
    | "s2"
    | "s3"
    | "s4"
    | "s5";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-brand-black/[0.12] text-brand-black/70",
    good: "border-[color:var(--color-good)]/40 text-[color:var(--color-good)]",
    warning:
      "border-[color:var(--warning-status)]/40 text-[color:var(--warning-status)]",
    critical:
      "border-[color:var(--color-critical)]/45 text-[color:var(--color-critical)]",
    s1: "border-[color:var(--color-s1)]/40 text-[color:var(--color-s1)]",
    s2: "border-[color:var(--color-s2)]/40 text-[color:var(--color-s2)]",
    s3: "border-[color:var(--color-s3)]/40 text-[color:var(--color-s3)]",
    s4: "border-[color:var(--color-s4)]/40 text-[color:var(--color-s4)]",
    s5: "border-[color:var(--color-s5)]/40 text-[color:var(--color-s5)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return <EmptyState title={title} description={hint} action={action} />;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <ShadcnSpinner className={className} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <ShadcnSkeleton className={cn("animate-pulse", className)} />;
}

/* ------------------------------------------------------------------ */
/* Panel (right-hand detail drawer)                                    */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // The sheet portals to <body>, so it would keep covering the screen after its
  // tab is hidden. Fold it away with the tab and leave `open` alone, so the
  // page reopens it — with its selection intact — when the tab comes back.
  const visible = usePageVisible();

  return (
    <Sheet open={open && visible} onOpenChange={(v) => !v && visible && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full max-w-xl flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="space-y-1 border-b border-brand-black/[0.06] px-5 py-4 text-left">
          <SheetTitle className="text-sm font-semibold text-brand-black">
            {title}
          </SheetTitle>
          {subtitle && (
            <SheetDescription className="text-xs text-brand-black/55">
              {subtitle}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="border-t border-brand-black/[0.06] px-5 py-3">
            {footer}
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Centered popup with the same header / body / footer slots as Drawer. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Same portal problem as Drawer — fold away with the tab so a memory modal
  // cannot cover whichever route is on screen.
  const visible = usePageVisible();

  return (
    <Dialog open={open && visible} onOpenChange={(v) => !v && visible && onClose()}>
      <DialogContent className="flex max-h-[min(88vh,44rem)] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b border-brand-black/[0.06] px-5 py-4 text-left">
          <DialogTitle className="text-sm font-semibold text-brand-black">
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="text-xs text-brand-black/55">
              {subtitle}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-brand-black/[0.06] px-5 py-3">
            {footer}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Copy-to-clipboard                                                   */
/* ------------------------------------------------------------------ */

export function Copyable({
  value,
  className = "",
  children,
}: {
  value: string;
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1400);
      }}
      className={cn(
        "focus-ring group inline-flex items-center gap-1.5 rounded text-left transition-colors hover:text-brand-black",
        className,
      )}
    >
      {children ?? <span className="mono text-xs">{value}</span>}
      <span className="text-[10px] text-brand-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export interface ToastItem {
  id: number;
  tone: "good" | "critical" | "neutral";
  text: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  function push(text: string, tone: ToastItem["tone"] = "neutral") {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }

  // Portal to <body> so toasts still paint when their tab is `display: none`.
  // Defer until after mount so SSR HTML matches the first client render.
  const view = !mounted
    ? null
    : createPortal(
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="animate-fade-in flex items-center gap-2 rounded-2xl border border-brand-black/[0.06] bg-card px-3.5 py-2 text-[13px] text-brand-black shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    t.tone === "good"
                      ? "var(--color-good)"
                      : t.tone === "critical"
                        ? "var(--color-critical)"
                        : "color-mix(in oklab, var(--brand-black) 55%, transparent)",
                }}
              />
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      );

  return { push, view };
}
