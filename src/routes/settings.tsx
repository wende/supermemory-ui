"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Input,
  SectionHeader,
  Skeleton,
  Spinner,
  Textarea,
  Toggle,
  useToasts,
} from "@/components/ui";
import { api } from "@/lib/api";
import { AccentThemeSelect } from "@/components/blocks/accent-theme-select";
import { KEY, invalidateCorpus, prefetch, useHealth, useSettings } from "@/lib/queries";
import { invalidateQueries } from "@/lib/query";
import {
  getBackendPreference,
  setBackendPreference,
  type BackendMode,
} from "@/lib/backend-mode";
import { bytes, duration } from "@/lib/format";
import type { OrgSettings, ProfileBucket, ServerInfo } from "@/lib/types";

export function warm(): void {
  void prefetch.settings();
  void prefetch.health();
}

export default function SettingsPage() {
  const { data: saved } = useSettings();
  const { data: server } = useHealth();

  // The form edits a draft. Seeding it once means a background refresh cannot
  // overwrite changes the user has not saved yet.
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  useEffect(() => {
    setSettings((draft) => draft ?? saved ?? null);
  }, [saved]);

  const [suggested, setSuggested] = useState<ProfileBucket[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState("");
  const [backendMode, setBackendMode] = useState<BackendMode>("remote");
  const { push, view: toasts } = useToasts();

  useEffect(() => {
    setBackendMode(getBackendPreference());
  }, []);

  function switchBackend(mode: BackendMode) {
    setBackendPreference(mode);
    setBackendMode(mode);
    push(
      mode === "mock" ? "Using bundled mock data" : "Using live instance",
      "neutral",
    );
    // Reload so every page refetches against the chosen backend.
    window.location.reload();
  }

  function patch<K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      await api.updateSettings(settings);
      invalidateQueries(KEY.settings);
      push("Settings saved", "good");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <PageBody maxWidth="4xl" className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </PageBody>
    );
  }

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-5">
        <PageTitle
          label="Instance"
          title="Settings"
          description="Instance-wide extraction, profile buckets, and storage configuration."
        >
          <Button
            size="sm"
            variant="primary"
            onClick={save}
            disabled={busy}
            className="rounded-full"
          >
            {busy && <Spinner />}
            Save changes
          </Button>
        </PageTitle>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <SectionHeader title="Appearance" meta="local only" />
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-brand-black">
                    Accent theme
                  </div>
                </div>
                <AccentThemeSelect className="shrink-0" />
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Data source"
              meta={
                server?.backend === "remote"
                  ? "live"
                  : server?.remoteConfigured
                    ? "mock (live available)"
                    : "mock"
              }
            />
            <div className="space-y-3 px-5 py-4">
              <Toggle
                checked={backendMode === "mock" || server?.remoteConfigured === false}
                onChange={(v) => {
                  if (server?.remoteConfigured === false) return;
                  switchBackend(v ? "mock" : "remote");
                }}
                label="Use bundled mock data"
                hint={
                  server?.remoteConfigured === false
                    ? "No SUPERMEMORY_URL configured — only the mock backend is available."
                    : "When off, the console proxies to the live instance. Tip: append ?mock or ?remote to any page URL."
                }
              />
              {server?.remoteConfigured === false ? null : (
                <p className="text-[11px] leading-relaxed text-brand-black/40">
                  Quick links:{" "}
                  <a className="underline underline-offset-2" href="/settings?mock">
                    ?mock
                  </a>
                  {" · "}
                  <a className="underline underline-offset-2" href="/settings?remote">
                    ?remote
                  </a>
                </p>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Extraction" meta="PATCH /v3/settings" />
            <div className="space-y-4 px-5 py-4">
              <Toggle
                checked={!!settings.shouldLLMFilter}
                onChange={(v) => patch("shouldLLMFilter", v)}
                label="Filter chunks before extraction"
                hint="Cheaper and quieter, at the cost of occasionally dropping something you wanted."
              />
              <div>
                <label className="label mb-2 block">Filter prompt</label>
                <Textarea
                  rows={4}
                  value={settings.filterPrompt ?? ""}
                  onChange={(e) => patch("filterPrompt", e.target.value)}
                  disabled={!settings.shouldLLMFilter}
                  className={settings.shouldLLMFilter ? "" : "opacity-50"}
                />
              </div>
              <div>
                <label className="label mb-2 block">Workspace prompt</label>
                <Textarea
                  rows={3}
                  value={settings.workspacePrompt ?? ""}
                  onChange={(e) => patch("workspacePrompt", e.target.value)}
                  placeholder="This is a personal workspace — prefer plain language and keep names, places, and dates exact."
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-brand-black/40">
                  Prepended to every extraction call. Use it to preserve jargon and
                  exact numbers the model would otherwise smooth over.
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="chunk" className="label">
                    Default chunk size
                  </label>
                  <span className="tnum text-xs font-medium text-brand-black">
                    {settings.chunkSize ?? 1200} tokens
                  </span>
                </div>
                <input
                  id="chunk"
                  type="range"
                  min={400}
                  max={2400}
                  step={100}
                  value={settings.chunkSize ?? 1200}
                  onChange={(e) => patch("chunkSize", Number(e.target.value))}
                  className="w-full accent-brand-black"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-brand-black/40">
                  Spaces may override this. Structure-aware splitting takes precedence
                  where a document actually has headings.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Include / exclude rules" />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <div>
                <label className="label mb-2 block">Include patterns</label>
                <Textarea
                  rows={6}
                  className="mono text-[11px]"
                  value={settings.includeItems.join("\n")}
                  onChange={(e) =>
                    patch(
                      "includeItems",
                      e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                    )
                  }
                />
              </div>
              <div>
                <label className="label mb-2 block">Exclude patterns</label>
                <Textarea
                  rows={6}
                  className="mono text-[11px]"
                  value={settings.excludeItems.join("\n")}
                  onChange={(e) =>
                    patch(
                      "excludeItems",
                      e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                    )
                  }
                />
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="Profile buckets"
              meta={`${settings.profileBuckets.length} defined`}
              action={
                <Button
                  size="sm"
                  disabled={suggesting}
                  onClick={async () => {
                    setSuggesting(true);
                    try {
                      const r = await api.suggestBuckets();
                      setSuggested(r.buckets);
                      if (!r.buckets.length) push("No new buckets to suggest");
                    } finally {
                      setSuggesting(false);
                    }
                  }}
                >
                  {suggesting ? <Spinner /> : <Icon.spark size={13} />}
                  Suggest
                </Button>
              }
            />
            <ul className="divide-y divide-brand-black/[0.05]">
              {settings.profileBuckets.map((b, i) => (
                <li key={b.key} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={b.key}
                      onChange={(e) => {
                        const next = [...settings.profileBuckets];
                        next[i] = { ...b, key: e.target.value };
                        patch("profileBuckets", next);
                      }}
                      className="mono mb-2 h-8 text-xs"
                    />
                    <Input
                      value={b.description}
                      onChange={(e) => {
                        const next = [...settings.profileBuckets];
                        next[i] = { ...b, description: e.target.value };
                        patch("profileBuckets", next);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${b.key}`}
                    onClick={() =>
                      patch(
                        "profileBuckets",
                        settings.profileBuckets.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Icon.trash size={13} />
                  </Button>
                </li>
              ))}
            </ul>

            {suggested.length > 0 && (
              <div className="border-t border-brand-black/[0.06] px-5 py-4">
                <div className="label mb-2.5">Suggested</div>
                <ul className="space-y-2">
                  {suggested.map((b) => (
                    <li
                      key={b.key}
                      className="flex items-start gap-3 rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mono text-xs text-brand-black/70">{b.key}</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-brand-black/55">
                          {b.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          patch("profileBuckets", [...settings.profileBuckets, b]);
                          setSuggested((s) => s.filter((x) => x.key !== b.key));
                        }}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-brand-black/[0.06] px-5 py-3">
              <Button
                size="sm"
                onClick={() =>
                  patch("profileBuckets", [
                    ...settings.profileBuckets,
                    { key: "new_bucket", description: "" },
                  ])
                }
              >
                <Icon.add size={13} />
                Add bucket
              </Button>
            </div>
          </Card>

          <Card className="border-[color:var(--color-critical)]/30">
            <SectionHeader
              title="Reset organisation"
              meta="POST /v3/settings/reset"
            />
            <div className="px-5 py-4">
              <p className="text-xs leading-relaxed text-brand-black/55">
                Removes every document, memory and space on this instance. On a real
                server this is not recoverable. Type{" "}
                <span className="mono text-brand-black/70">RESET</span> to enable the button.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  value={confirmReset}
                  onChange={(e) => setConfirmReset(e.target.value)}
                  placeholder="RESET"
                  className="mono h-9 w-32 rounded-full"
                  aria-label="Type RESET to confirm"
                />
                <Button
                  variant="danger"
                  size="sm"
                  disabled={confirmReset !== "RESET" || resetting}
                  className="rounded-full"
                  onClick={async () => {
                    setResetting(true);
                    try {
                      const r = await api.reset();
                      push(
                        `Removed ${r.removed.documents} documents and ${r.removed.memories} memories`,
                        "neutral",
                      );
                      setConfirmReset("");
                      // The corpus is gone; drop the draft so the freshly
                      // fetched settings seed the form again.
                      setSettings(null);
                      invalidateQueries(KEY.settings);
                      invalidateCorpus();
                    } finally {
                      setResetting(false);
                    }
                  }}
                >
                  {resetting && <Spinner />}
                  Reset everything
                </Button>
                <span className="text-[11px] text-brand-black/40">
                  In this demo the seeded corpus is restored afterwards.
                </span>
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          {server && (
            <>
              <Card>
                <SectionHeader title="Runtime" meta={server.mode} />
                <dl className="divide-y divide-brand-black/[0.05] px-4 text-xs">
                  <Row
                    label="Version"
                    value={server.version ? `v${server.version}` : "—"}
                  />
                  <Row
                    label="Port"
                    value={server.port != null ? String(server.port) : "—"}
                    mono
                  />
                  <Row
                    label="Uptime"
                    value={
                      server.uptimeSeconds != null
                        ? duration(server.uptimeSeconds)
                        : "—"
                    }
                  />
                  <Row
                    label="State size"
                    value={
                      server.storage
                        ? bytes(server.storage.sizeBytes)
                        : "—"
                    }
                  />
                  <Row
                    label="Engine"
                    value={server.storage?.engine ?? "—"}
                  />
                  <Row
                    label="Path"
                    value={server.storage?.path ?? "—"}
                    mono
                  />
                </dl>
                <RuntimeSource server={server} />
              </Card>

              <Card>
                <SectionHeader title="Models" />
                <div className="space-y-3.5 px-4 py-3.5">
                  <div>
                    <div className="label mb-1.5">Embeddings</div>
                    <div className="mono text-xs text-brand-black/70">
                      {server.embeddings?.model ?? "—"}
                    </div>
                    {server.embeddings && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone="s1">{server.embeddings.dimensions}d</Badge>
                        {server.embeddings.local ? (
                          <Badge tone="good">in-process</Badge>
                        ) : (
                          <Badge>{server.embeddings.provider}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-brand-black/[0.06] pt-3.5">
                    <div className="label mb-1.5">Extraction</div>
                    <div className="mono text-xs text-brand-black/70">
                      {server.llm?.model ?? (server.llm ? "server default" : "—")}
                    </div>
                    {server.llm && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone="s1">{server.llm.provider}</Badge>
                      </div>
                    )}
                    {server.llm?.baseUrl && (
                      <Copyable
                        value={server.llm.baseUrl}
                        className="mt-1.5 text-brand-black/40"
                      />
                    )}
                  </div>
                </div>
              </Card>

              <Card>
                <SectionHeader title="Capabilities" />
                <ul className="divide-y divide-brand-black/[0.05] px-4">
                  {Object.entries(server.features).map(([k, on]) => (
                    <li
                      key={k}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <span className="text-brand-black/70">
                        {k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                      </span>
                      <span
                        className="flex shrink-0 items-center gap-1.5 text-[11px]"
                        style={{
                          color: on ? "var(--color-good)" : "color-mix(in oklab, var(--brand-black) 40%, transparent)",
                        }}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {on ? "on" : "platform only"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

        </aside>
        </div>
      </PageBody>
      {toasts}
    </>
  );
}

/**
 * Says where the rows above came from. Against a live instance most of them
 * are blank by necessity: the Memory API publishes no version, uptime, model
 * or storage endpoint, so they can only be read off the machine the server
 * runs on.
 */
function RuntimeSource({ server }: { server: ServerInfo }) {
  if (server.runtimeSource === "mock") return null;

  if (server.runtimeSource === "disk") {
    return (
      <div className="border-t border-brand-black/[0.06] px-4 py-3">
        <div className="mb-1.5">
          <Badge tone="good">read on disk</Badge>
        </div>
        <p className="mono text-[11px] leading-relaxed break-all text-brand-black/40">
          {server.runtimeSourceDir}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-brand-black/[0.06] px-4 py-3">
      <div className="mb-1.5">
        <Badge tone={server.runtimeSourceDir ? "warning" : "neutral"}>
          {server.runtimeSourceDir ? "install dir unreadable" : "derived from URL"}
        </Badge>
      </div>
      <p className="text-[11px] leading-relaxed text-brand-black/40">
        The Memory API exposes no version, uptime, model or storage endpoint, so
        these cannot be proxied.{" "}
        {server.runtimeSourceDir ? (
          <>
            <span className="mono break-all text-brand-black/60">
              {server.runtimeSourceDir}
            </span>{" "}
            is set as the install directory but does not read as one — check the
            path and that this process can read it.
          </>
        ) : (
          <>
            If the console runs on the same machine as the server, set{" "}
            <span className="mono text-brand-black/60">
              SUPERMEMORY_LOCAL_DIR
            </span>{" "}
            to its install directory (usually{" "}
            <span className="mono text-brand-black/60">~/.supermemory</span>) and
            they are read from disk instead.
          </>
        )}
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-brand-black/40">{label}</dt>
      <dd className={`truncate text-right text-brand-black/70 ${mono ? "mono text-[11px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
