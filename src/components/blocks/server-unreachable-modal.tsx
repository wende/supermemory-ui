"use client";

/**
 * Global guard against a configured live instance going unreachable.
 *
 * Every page proxies through this app's own `/api/*` routes, so a dead
 * upstream used to surface as a silent, per-panel failure — a query stuck on
 * `error`, its section rendering nothing. This mounts once at the shell level
 * and instead puts the operator in front of the one fact that matters: the
 * URL that failed, with a button to re-check it.
 */

import { useEffect, useState } from "react";
import { Button, Copyable, Modal, Spinner } from "@/components/ui";
import { useHealth } from "@/lib/queries";

export function ServerUnreachableModal() {
  const { data, refetch } = useHealth({ refetchInterval: 15_000 });
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const unreachable = data?.backend === "remote" && data.status !== "ok";

  // A fresh failure (including one after a prior failure recovered) should
  // reopen the dialog even if the operator dismissed an earlier one.
  useEffect(() => {
    if (!unreachable) setDismissed(false);
  }, [unreachable]);

  if (!unreachable || dismissed) return null;

  async function check() {
    setChecking(true);
    try {
      await refetch();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => setDismissed(true)}
      title="Live instance unreachable"
      subtitle="Requests to the configured Memory API are failing."
      footer={
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={checking} onClick={check}>
            {checking && <Spinner />}
            Check health
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label mb-1.5">Server URL</div>
          <Copyable value={data?.baseUrl ?? "unknown"} />
        </div>
        <p className="text-xs leading-relaxed text-brand-black/55">
          The console could not reach this address. Confirm the instance is
          running and that this URL is correct, then check again — or switch
          to the bundled mock backend from Settings while you sort it out.
        </p>
      </div>
    </Modal>
  );
}
