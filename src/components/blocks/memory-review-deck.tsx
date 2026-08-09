"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, Skeleton, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { relTime } from "@/lib/format";
import { invalidateCorpus, useMemoryList } from "@/lib/queries";
import {
  SWIPE_THRESHOLD,
  getReviewLogSnapshot,
  getServerReviewLogSnapshot,
  pendingReview,
  persistReviewDecision,
  subscribeReviewLog,
  swipeOutcome,
  type SwipeOutcome,
} from "@/lib/review";
import type { ContainerTag, MemoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/** How long a card takes to leave the deck once a decision is made. */
const EXIT_MS = 260;
/** Cards drawn behind the top one. */
const PEEK = 2;

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */

export interface DeckProgress {
  index: number;
  tally: { kept: number; discarded: number; skipped: number };
}

const EMPTY_TALLY: DeckProgress["tally"] = { kept: 0, discarded: 0, skipped: 0 };

export interface MemoryReviewDeckProps {
  open: boolean;
  /** Queue snapshot — taken when the deck opens so it cannot reshuffle mid-review. */
  entries: MemoryEntry[];
  onClose: () => void;
  /** Resolves once the decision is durable. `edited` is null when kept as written. */
  onKeep: (entry: MemoryEntry, edited: string | null) => Promise<void>;
  onDiscard: (entry: MemoryEntry) => Promise<void>;
  onSkip?: (entry: MemoryEntry) => void;
  /** Maps a space id to its display name; falls back to the raw id. */
  spaceName?: (spaceId: string) => string;
  /**
   * `dialog` portals a modal (memory bank). `panel` renders as a regular card
   * for embedding in a page section (dashboard Recent).
   */
  variant?: "dialog" | "panel";
  /**
   * Restored queue position — the dashboard pill tabs unmount panel content,
   * so progress lives in the parent hook and is passed back in on remount.
   */
  progress?: DeckProgress;
  onProgress?: (next: DeckProgress) => void;
}

/**
 * A card deck for triaging inferred memories: swipe or click right to keep,
 * left to discard, down to skip. Any card can be edited before it is kept.
 */
export function MemoryReviewDeck({
  open,
  entries,
  onClose,
  onKeep,
  onDiscard,
  onSkip,
  spaceName,
  variant = "dialog",
  progress,
  onProgress,
}: MemoryReviewDeckProps) {
  const reduceMotion = usePrefersReducedMotion();

  const [index, setIndex] = useState(progress?.index ?? 0);
  const [tally, setTally] = useState(progress?.tally ?? EMPTY_TALLY);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [exit, setExit] = useState<SwipeOutcome | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gesture = useRef<Gesture | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const entry: MemoryEntry | undefined = entries[index];
  const done = index >= entries.length;
  const total = entries.length;

  const commit = useCallback(
    async (outcome: SwipeOutcome, edited: string | null = null) => {
      const current = entries[index];
      if (!current || busy) return;

      setError(null);
      setDrag(null);
      setExit(outcome);
      setBusy(true);

      // Run the animation and the request together — the card leaves at the
      // same speed whether the backend answers in 5ms or 500ms.
      const settled = wait(reduceMotion ? 0 : EXIT_MS, timers.current);
      try {
        if (outcome === "keep") await onKeep(current, edited);
        else if (outcome === "discard") await onDiscard(current);
        else onSkip?.(current);
      } catch (e) {
        setExit(null);
        setBusy(false);
        setError(e instanceof Error ? e.message : "That decision did not stick.");
        return;
      }
      await settled;
      timers.current = [];

      // Compute outside setState updaters — notifying the parent (setSession)
      // from inside an updater runs during this component's render phase.
      const nextTally = {
        kept: tally.kept + (outcome === "keep" ? 1 : 0),
        discarded: tally.discarded + (outcome === "discard" ? 1 : 0),
        skipped: tally.skipped + (outcome === "skip" ? 1 : 0),
      };
      const nextIndex = index + 1;
      setTally(nextTally);
      setIndex(nextIndex);
      onProgressRef.current?.({ index: nextIndex, tally: nextTally });
      setEditing(false);
      setDraft("");
      setExit(null);
      setBusy(false);
    },
    [busy, entries, index, onDiscard, onKeep, onSkip, reduceMotion, tally],
  );

  /* -- gesture ---------------------------------------------------- */

  const canDrag = !!entry && !editing && !busy && !exit;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canDrag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Let the controls inside the card handle their own clicks.
    if ((e.target as HTMLElement).closest("button, a, textarea, input")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastT: e.timeStamp,
      vx: 0,
    };
    setDrag({ dx: 0, dy: 0 });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.vx = (e.clientX - g.lastX) / dt;
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    setDrag({ dx: e.clientX - g.x0, dy: e.clientY - g.y0 });
  }

  function endGesture(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const outcome = cancelled ? null : swipeOutcome(dx, dy, g.vx);
    if (outcome) commit(outcome);
    else setDrag(null);
  }

  function startEditing() {
    if (!entry) return;
    setDraft(entry.memory);
    setEditing(true);
    setDrag(null);
  }

  /* -- card transform --------------------------------------------- */

  const dx = drag?.dx ?? 0;
  const dy = drag?.dy ?? 0;
  const lean = Math.max(-1, Math.min(1, dx / SWIPE_THRESHOLD));
  const transform = exit
    ? EXIT_TRANSFORM[exit]
    : drag
      ? `translate3d(${dx}px, ${dy}px, 0) rotate(${lean * 7}deg)`
      : "translate3d(0, 0, 0)";

  const header = (
    <header className="flex items-start justify-between gap-4 px-6 pt-5">
      <div className="min-w-0">
        <div className="text-[10px] font-bold tracking-[0.18em] text-brand-black/35 uppercase">
          Review
        </div>
        {variant === "dialog" ? (
          <>
            <DialogPrimitive.Title className="mt-1 text-[15px] font-semibold text-brand-black">
              Suggested memories
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-0.5 text-[12px] text-brand-black/55">
              Claims the engine inferred — keep the ones that fit.
            </DialogPrimitive.Description>
          </>
        ) : (
          <>
            <h2 className="mt-1 text-[15px] font-semibold text-brand-black">
              Suggested memories
            </h2>
            <p className="mt-0.5 text-[12px] text-brand-black/55">
              Claims the engine inferred — keep the ones that fit.
            </p>
          </>
        )}
      </div>
      {variant === "dialog" ? (
        <DialogPrimitive.Close
          aria-label="Close review"
          className="focus-ring -mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-brand-black/40 transition-colors hover:bg-brand-black/[0.05] hover:text-brand-black"
        >
          <Icon.forget size={15} />
        </DialogPrimitive.Close>
      ) : null}
    </header>
  );

  const body = (
    <>
      {total > 0 && (
        <Progress
          current={Math.min(index + (done ? 0 : 1), total)}
          total={total}
          done={index}
        />
      )}

      {/* The in-page panel grows with its card on a phone — a scroll region
          nested inside the page scroller is hard to hit with a thumb. The
          dialog keeps its own scroll, since it can't grow past the viewport. */}
      <div
        className={cn(
          "min-h-0 flex-1 px-6 pt-4 pb-6",
          variant === "panel"
            ? "overflow-visible sm:overflow-y-auto"
            : "overflow-y-auto",
        )}
      >
        {total === 0 ? (
          <Resting
            title="Nothing to review"
            hint="New inferences show up here as the engine derives them."
          />
        ) : done ? (
          <Resting
            title="Deck cleared"
            hint={`${tally.kept} kept · ${tally.discarded} discarded${
              tally.skipped ? ` · ${tally.skipped} skipped for later` : ""
            }`}
          />
        ) : (
          <div className="relative">
            {/* Cards still queued, peeking out from under the top card. */}
            {entries
              .slice(index + 1, index + 1 + PEEK)
              .map((m, i) => (
                <div
                  key={m.id}
                  aria-hidden
                  className="absolute inset-x-0 top-0 rounded-[22px] border border-brand-black/[0.10] bg-brand-black/[0.04]"
                  style={{
                    height: "100%",
                    transform: `translateY(${(i + 1) * 16}px) scale(${1 - (i + 1) * 0.04})`,
                    opacity: 0.85 - i * 0.18,
                  }}
                />
              ))}

            <div
              role="group"
              aria-label={`Suggestion ${index + 1} of ${total}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => endGesture(e, false)}
              onPointerCancel={(e) => endGesture(e, true)}
              className={cn(
                "relative z-10 flex min-h-[15rem] flex-col rounded-[22px] border border-brand-black/[0.06] bg-card px-5 py-4 shadow-[0_10px_30px_rgba(17,17,17,0.06)]",
                // Dragging a card must not smear a text selection across it.
                canDrag && "cursor-grab touch-none select-none active:cursor-grabbing",
                exit && "pointer-events-none",
              )}
              style={{
                transform,
                opacity: exit ? 0 : 1,
                transition:
                  drag || reduceMotion
                    ? undefined
                    : `transform ${EXIT_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${EXIT_MS}ms ease-out`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge tone="s2">
                  <span
                    className="size-1.5 rounded-full bg-[color:var(--color-s2)]"
                    aria-hidden
                  />
                  inferred
                </Badge>
                {!editing && (
                  <button
                    type="button"
                    onClick={startEditing}
                    disabled={busy}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-brand-black/45 transition-colors hover:bg-brand-black/[0.04] hover:text-brand-black disabled:opacity-50"
                  >
                    <Icon.edit size={12} />
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={6}
                  autoFocus
                  aria-label="Edit this memory before keeping it"
                  className="mt-3 flex-1 break-words text-[14px] leading-relaxed"
                />
              ) : (
                <p className="mt-3 flex-1 break-words text-[16px] leading-relaxed text-brand-black [overflow-wrap:anywhere]">
                  {entry?.memory}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-brand-black/40">
                <span className="text-brand-black/55">
                  {entry ? (spaceName?.(entry.spaceId) ?? entry.spaceId) : ""}
                </span>
                <span aria-hidden>·</span>
                <span>{entry ? relTime(entry.createdAt) : ""}</span>
                {!!entry?.sourceCount && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      from {entry.sourceCount}{" "}
                      {entry.sourceCount === 1 ? "memory" : "memories"}
                    </span>
                  </>
                )}
                {entry && entry.version > 1 && (
                  <Badge tone="s5">v{entry.version}</Badge>
                )}
              </div>

              {/* Swipe intent, shown as the card leans. */}
              <Stamp label="Keep" tone="good" opacity={Math.max(0, lean)} />
              <Stamp label="Discard" tone="critical" opacity={Math.max(0, -lean)} />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-center text-[12px] text-[color:var(--color-critical)]">
            {error}
          </p>
        )}

        <p className="sr-only" aria-live="polite">
          {done
            ? "Review complete."
            : `Suggestion ${index + 1} of ${total}. ${entry?.memory ?? ""}`}
        </p>
      </div>

      <footer className="border-t border-brand-black/[0.05] px-6 py-4">
        {done || total === 0 ? (
          <div className="flex justify-center">
            <Button size="sm" variant={variant === "dialog" ? "primary" : "outline"} onClick={onClose}>
              {variant === "dialog"
                ? "Done"
                : done
                  ? "Check for new suggestions"
                  : "Done"}
            </Button>
          </div>
        ) : editing ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !draft.trim()}
              onClick={() => {
                const text = draft.trim();
                commit("keep", text === entry?.memory ? null : text);
              }}
            >
              {busy && <Spinner />}
              Keep edited
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <span className="w-full text-center text-[11px] text-brand-black/40">
              Keeping an edit saves it as v{(entry?.version ?? 1) + 1}.
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-5">
              <SwipeButton
                tone="critical"
                label="Discard"
                hint="Forget this suggestion"
                disabled={busy}
                onClick={() => commit("discard")}
              >
                <Icon.forget size={20} />
              </SwipeButton>
              <button
                type="button"
                disabled={busy}
                onClick={() => commit("skip")}
                title="Decide later"
                className="focus-ring rounded-full px-3 py-1.5 text-[12px] font-medium text-brand-black/45 transition-colors hover:bg-brand-black/[0.04] hover:text-brand-black disabled:opacity-50"
              >
                Skip
              </button>
              <SwipeButton
                tone="good"
                label="Keep"
                hint="Keep this memory"
                disabled={busy}
                onClick={() => commit("keep")}
              >
                <Icon.check size={20} />
              </SwipeButton>
            </div>
          </>
        )}
      </footer>
    </>
  );

  if (variant === "panel") {
    if (!open) return null;
    return (
      <section
        aria-label="Suggested memories"
        className="flex flex-col overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_18px_45px_rgba(17,17,17,0.05)] sm:max-h-[min(36rem,70vh)]"
      >
        {header}
        {body}
      </section>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="animate-fade-in-scale fixed top-1/2 left-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-brand-black/[0.06] bg-card shadow-[0_28px_70px_rgba(17,17,17,0.18)] outline-none">
          {header}
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Hook — queue, persistence, and the API calls behind each decision   */
/* ------------------------------------------------------------------ */

export interface UseMemoryReview {
  /** Suggestions waiting on a decision. */
  pending: number;
  /** True once the first queue fetch has settled. */
  ready: boolean;
  open: () => void;
  refresh: () => Promise<void>;
  /** Render this anywhere in the tree — it portals itself (dialog mode). */
  deck: ReactNode;
  /** Inline card for embedding in a page section (panel mode). */
  pane: ReactNode;
}

type ReviewSession = {
  id: number;
  entries: MemoryEntry[];
  index: number;
  tally: DeckProgress["tally"];
};

/**
 * Loads inferred memories that have not been reviewed yet and wires the deck
 * to the review API: keep → approve, discard → decline. An edited keep writes
 * a new version first. The local ledger mirrors each decision so the queue
 * updates before the list refetches.
 */
export function useMemoryReview(
  opts: {
    /** Restrict the queue to one space. */
    space?: string;
    spaces?: ContainerTag[];
    /** Called after the deck closes, once decisions have landed. */
    onSettled?: () => void;
    /**
     * When true, the queue auto-opens into `pane` (no modal). Used by the
     * dashboard Recent tab.
     */
    embedded?: boolean;
  } = {},
): UseMemoryReview {
  const { space, spaces, onSettled, embedded = false } = opts;

  const log = useSyncExternalStore(
    subscribeReviewLog,
    getReviewLogSnapshot,
    getServerReviewLogSnapshot,
  );

  const queueInput = useMemo(
    () => ({
      containerTags: space ? [space] : undefined,
      onlyInference: true as const,
      sort: "createdAt" as const,
      limit: 100,
    }),
    [space],
  );
  const queue = useMemoryList(queueInput);
  const candidates = queue.data?.memoryEntries ?? [];
  const ready = !queue.isLoading;
  const refetchQueue = queue.refetch;

  const [session, setSession] = useState<ReviewSession | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    await refetchQueue();
  }, [refetchQueue]);

  const pending = useMemo(() => pendingReview(candidates, log), [candidates, log]);

  const onKeep = useCallback(
    async (entry: MemoryEntry, edited: string | null) => {
      let version = entry.version;
      const wroteVersion = Boolean(edited && edited !== entry.memory);
      if (wroteVersion && edited) {
        const updated = await api.updateMemory(entry.id, edited);
        version = updated?.version ?? entry.version + 1;
      }
      await persistReviewDecision(entry, "kept", version);
      // Plain keep is already dropped by the next onlyInference refetch; corpus
      // views only need a refresh when an edit wrote a new version.
      if (wroteVersion) invalidateCorpus();
    },
    [],
  );

  const onDiscard = useCallback(async (entry: MemoryEntry) => {
    // Decline soft-forgets; the queue's onlyInference filter drops forgotten rows.
    await persistReviewDecision(entry, "discarded");
    invalidateCorpus();
  }, []);

  const spaceName = useCallback(
    (id: string) => spaces?.find((s) => s.containerTag === id)?.name ?? id,
    [spaces],
  );

  const open = useCallback(() => {
    if (!pending.length) return;
    seq.current += 1;
    setSession({
      id: seq.current,
      entries: pending,
      index: 0,
      tally: EMPTY_TALLY,
    });
  }, [pending]);

  const close = useCallback(() => {
    setSession(null);
    refresh().then(() => onSettled?.());
  }, [onSettled, refresh]);

  const onProgress = useCallback((next: DeckProgress) => {
    setSession((s) => (s ? { ...s, index: next.index, tally: next.tally } : s));
  }, []);

  // Embedded panels auto-start a review session when work appears.
  useEffect(() => {
    if (!embedded || !ready || session) return;
    if (!pending.length) return;
    seq.current += 1;
    setSession({
      id: seq.current,
      entries: pending,
      index: 0,
      tally: EMPTY_TALLY,
    });
  }, [embedded, ready, session, pending]);

  const deck = (
    <MemoryReviewDeck
      key={session?.id ?? "idle"}
      open={!embedded && session !== null}
      entries={session?.entries ?? []}
      progress={
        session
          ? { index: session.index, tally: session.tally }
          : undefined
      }
      onProgress={onProgress}
      onClose={close}
      onKeep={onKeep}
      onDiscard={onDiscard}
      spaceName={spaceName}
    />
  );

  const pane =
    embedded && !ready ? (
      <Skeleton className="h-[22rem] w-full rounded-[28px]" />
    ) : (
      <MemoryReviewDeck
        key={`pane-${session?.id ?? "idle"}`}
        variant="panel"
        open={
          embedded &&
          ready &&
          (session !== null || pending.length === 0)
        }
        entries={session?.entries ?? []}
        progress={
          session
            ? { index: session.index, tally: session.tally }
            : undefined
        }
        onProgress={onProgress}
        onClose={close}
        onKeep={onKeep}
        onDiscard={onDiscard}
        spaceName={spaceName}
      />
    );

  return { pending: pending.length, ready, open, refresh, deck, pane };
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  lastX: number;
  lastT: number;
  vx: number;
}

const EXIT_TRANSFORM: Record<SwipeOutcome, string> = {
  keep: "translate3d(140%, -2rem, 0) rotate(16deg)",
  discard: "translate3d(-140%, -2rem, 0) rotate(-16deg)",
  skip: "translate3d(0, 25%, 0) scale(0.92)",
};

function wait(ms: number, bucket: ReturnType<typeof setTimeout>[]): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    bucket.push(setTimeout(resolve, ms));
  });
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Dots while the queue is short enough to count, a bar once it is not. */
function Progress({
  current,
  total,
  done,
}: {
  current: number;
  total: number;
  done: number;
}) {
  return (
    <div className="flex items-center gap-3 px-6 pt-4">
      {total <= 20 ? (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-200",
                i < done
                  ? "bg-brand-black/25"
                  : i === done
                    ? "bg-[color:var(--color-s2)]"
                    : "bg-brand-black/[0.08]",
              )}
            />
          ))}
        </div>
      ) : (
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-black/[0.08]">
          <div
            className="h-full rounded-full bg-[color:var(--color-s2)] transition-[width] duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}
      <span className="tnum shrink-0 text-[11px] text-brand-black/45">
        {current}/{total}
      </span>
    </div>
  );
}

function Stamp({
  label,
  tone,
  opacity,
}: {
  label: string;
  tone: "good" | "critical";
  opacity: number;
}) {
  const color = tone === "good" ? "var(--color-good)" : "var(--color-critical)";
  return (
    <span
      aria-hidden
      className={cn(
        // The stamp sits opposite the direction of travel so it stays inside
        // the dialog while the card slides out of it.
        "pointer-events-none absolute top-[3.25rem] rounded-md border px-2 py-1 text-[11px] font-bold tracking-[0.14em] uppercase",
        tone === "good" ? "left-4" : "right-4",
      )}
      style={{
        color,
        borderColor: color,
        // Opaque so the memory text does not read through the stamp.
        background: `color-mix(in oklab, ${color} 12%, var(--card))`,
        opacity: Math.min(1, opacity),
      }}
    >
      {label}
    </span>
  );
}

function SwipeButton({
  tone,
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  tone: "good" | "critical";
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const color = tone === "good" ? "var(--color-good)" : "var(--color-critical)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={hint}
      className="focus-ring inline-flex size-14 items-center justify-center rounded-full border transition-[transform,background-color] duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
        background: `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      {children}
    </button>
  );
}

function Resting({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[15rem] flex-col items-center justify-center gap-2 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-black/[0.035] text-brand-black/40">
        <Icon.spark size={17} />
      </span>
      <p className="text-[14px] font-medium text-brand-black">{title}</p>
      <p className="max-w-[22rem] text-[12px] leading-relaxed text-brand-black/55">
        {hint}
      </p>
    </div>
  );
}
