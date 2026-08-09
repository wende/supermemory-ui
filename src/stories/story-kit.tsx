/**
 * Small presentational helpers shared by the foundation and pattern stories.
 *
 * They exist so a story can lay out a specimen grid without re-inventing the
 * same flex/label markup fifteen times — and so those scaffolds never get
 * mistaken for product components. Nothing in here is imported by the app.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/** Uppercase micro-label — the same eyebrow the product uses. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="label">{children}</div>;
}

/** A titled band of specimens with an optional explanatory line. */
export function Section({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-10 last:mb-0", className)}>
      <h3 className="text-[15px] font-semibold tracking-tight text-brand-black">
        {title}
      </h3>
      {note && (
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-brand-black/55">
          {note}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Responsive specimen grid. */
export function Grid({
  min = 200,
  children,
  className,
}: {
  min?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-3", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal specimen row that wraps. */
export function Row({
  children,
  className,
  align = "center",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "center" | "start" | "end" | "baseline";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-3",
        align === "center" && "items-center",
        align === "start" && "items-start",
        align === "end" && "items-end",
        align === "baseline" && "items-baseline",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Vertical stack with the console's default rhythm. */
export function Stack({
  children,
  gap = 12,
  className,
}: {
  children: React.ReactNode;
  gap?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)} style={{ gap }}>
      {children}
    </div>
  );
}

/**
 * A neutral bordered well. Use it when a specimen needs a boundary but must
 * not be confused with `Card` / `PanelCard`, which carry design meaning.
 */
export function Well({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-brand-black/[0.12] p-5",
        className,
      )}
    >
      {label && <div className="label mb-3">{label}</div>}
      {children}
    </div>
  );
}

/** A colour chip with its token name, resolved value, and role. */
export function Swatch({
  token,
  role,
  height = 56,
  border,
}: {
  /** CSS custom property name, e.g. `--s1`. */
  token: string;
  role?: string;
  height?: number;
  /** Draw a hairline — needed for near-background swatches. */
  border?: boolean;
}) {
  const [resolved, setResolved] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  // Resolve against the live element so the value tracks the theme switcher.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () =>
      setResolved(getComputedStyle(el).getPropertyValue(token).trim());
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => mo.disconnect();
  }, [token]);

  return (
    <div ref={ref} className="min-w-0">
      <div
        className={cn(
          "rounded-xl",
          border && "border border-brand-black/[0.12]",
        )}
        style={{ height, background: `var(${token})` }}
      />
      <div className="mono mt-2 truncate text-[11px] text-brand-black">
        {token}
      </div>
      <div className="mono truncate text-[11px] text-brand-black/45">
        {resolved || "—"}
      </div>
      {role && (
        <div className="mt-0.5 truncate text-[11px] text-brand-black/55">
          {role}
        </div>
      )}
    </div>
  );
}

/** Two-column spec row: name on the left, rendered specimen on the right. */
export function SpecRow({
  name,
  hint,
  children,
}: {
  name: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-brand-black/[0.05] py-3 last:border-b-0">
      <div className="w-44 shrink-0">
        <div className="mono text-[11px] text-brand-black/70">{name}</div>
        {hint && (
          <div className="text-[11px] text-brand-black/40">{hint}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Fixed-height frame for stories that need real layout space (shells, graphs,
 * scroll containers) rather than shrink-to-fit.
 */
export function Frame({
  height = 560,
  children,
  className,
}: {
  height?: number | string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-brand-black/[0.08]",
        className,
      )}
      style={{ height }}
    >
      {children}
    </div>
  );
}
