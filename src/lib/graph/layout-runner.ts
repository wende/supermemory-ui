import {
  createLayoutJob,
  type LayoutJob,
  type LayoutProgress,
  type LayoutRequest,
} from "./layout-engine";

/**
 * Time the first slice of a settle may hold the main thread. Small graphs
 * finish inside it and paint fully laid out on their first frame, exactly as
 * they did when layout was synchronous.
 */
const OPENING_BUDGET_MS = 70;

/**
 * Per-frame budget once a settle spills past the opening slice. Deliberately
 * under a frame: a single tick on a large graph already overruns this, so the
 * loop degrades to one tick per frame — which is the point. The page keeps
 * handling input and painting between ticks instead of freezing for a second.
 */
const FRAME_BUDGET_MS = 8;

export type LayoutRunHandlers = {
  /** Fired for every slice, including the final one (`progress.done`). */
  onProgress: (progress: LayoutProgress) => void;
};

/**
 * Runs force layout in slices instead of one blocking call.
 *
 * A 3k-node settle is roughly a second of solid CPU. Spending it in one go
 * froze the tab and left nothing to report progress with; spending it a slice
 * per frame costs marginally more wall-clock but keeps the graph interactive
 * and makes the build observable while it happens.
 *
 * Layout would ideally run in a Web Worker, but Turbopack does not currently
 * compile `new Worker(new URL(...))` entrypoints — it copies the module through
 * as a static asset, which then fails to load. Moving this off-thread needs a
 * prebuilt worker bundle; the slicing here is what keeps the main thread usable
 * in the meantime.
 */
export class LayoutRunner {
  private runId = 0;
  private handlers: LayoutRunHandlers | null = null;
  private frame = 0;
  private job: LayoutJob | null = null;

  /** Start a settle, superseding any run already in flight. */
  run(req: Omit<LayoutRequest, "runId">, handlers: LayoutRunHandlers): void {
    this.cancel();
    const runId = ++this.runId;
    this.handlers = handlers;

    const job = createLayoutJob({ ...req, runId });
    this.job = job;

    // The opening slice runs inline so there is no empty frame before the
    // graph takes shape, and so small graphs never flash a progress meter.
    const first = job.runFor(OPENING_BUDGET_MS);
    if (first) handlers.onProgress(first);
    if (job.done) {
      this.job = null;
      return;
    }
    this.schedule(job, runId);
  }

  private schedule(job: LayoutJob, runId: number): void {
    const pump = () => {
      this.frame = 0;
      // A newer run — or an unmount — supersedes this one.
      if (this.job !== job || this.runId !== runId) return;
      const progress = job.runFor(FRAME_BUDGET_MS);
      if (!progress) return;
      this.handlers?.onProgress(progress);
      if (job.done) {
        this.job = null;
        return;
      }
      this.frame = requestAnimationFrame(pump);
    };
    this.frame = requestAnimationFrame(pump);
  }

  /** True while a settle is still being stepped across frames. */
  get running(): boolean {
    return this.job !== null;
  }

  /** Abandon the run in flight; queued slices are dropped by run id. */
  cancel(): void {
    this.runId++;
    this.handlers = null;
    this.job = null;
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  dispose(): void {
    this.cancel();
  }
}
