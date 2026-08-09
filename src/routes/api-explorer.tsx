"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PageBody, PageTitle } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  Copyable,
  Input,
  SectionHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import { API_BASE, api } from "@/lib/api";
import { prefetch, useHealth } from "@/lib/queries";
import { ENDPOINTS, METHOD_COLOR, type Endpoint } from "@/lib/endpoints";

export function warm(): void {
  void prefetch.health();
}

export default function ApiExplorerPage() {
  const [selected, setSelected] = useState<Endpoint>(
    ENDPOINTS.find((e) => e.path === "/v4/search")!,
  );
  const [path, setPath] = useState("/v4/search");
  const [payload, setPayload] = useState(
    JSON.stringify(ENDPOINTS.find((e) => e.path === "/v4/search")!.sample, null, 2),
  );
  const [res, setRes] = useState<{ status: number; ms: number; body: unknown } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const health = useHealth();
  const backend: "mock" | "remote" | null = health.data
    ? health.data.backend === "remote"
      ? "remote"
      : "mock"
    : health.error
      ? "mock"
      : null;

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const matched = ENDPOINTS.filter(
      (e) =>
        !q ||
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.method.toLowerCase() === q,
    );
    const out = new Map<string, Endpoint[]>();
    for (const e of matched) {
      if (!out.has(e.group)) out.set(e.group, []);
      out.get(e.group)!.push(e);
    }
    return out;
  }, [filter]);

  function pick(e: Endpoint) {
    setSelected(e);
    setPath(e.path);
    setPayload(e.sample ? JSON.stringify(e.sample, null, 2) : "");
    setRes(null);
    setErr(null);
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      let parsed: unknown;
      if (payload.trim()) {
        try {
          parsed = JSON.parse(payload);
        } catch {
          setErr("Request body is not valid JSON.");
          return;
        }
      }
      if (path.includes("{")) {
        setErr("Replace the {placeholder} in the path with a real id first.");
        return;
      }
      setRes(await api.raw(selected.method, path, parsed));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const mockedCount = ENDPOINTS.filter((e) => e.mocked).length;

  return (
    <>
      <PageBody maxWidth="4xl" className="space-y-5">
        <PageTitle
          label="Instance"
          title="API explorer"
          description="Call every documented endpoint against the base URL below."
        >
          <Copyable
            value={API_BASE}
            className="rounded-full border border-brand-black/[0.06] bg-card px-3 py-1.5"
          >
            <span className="mono text-xs text-brand-black/70">
              {backend === "remote" ? "/api (remote)" : "/api (mock)"}
            </span>
          </Copyable>
        </PageTitle>

        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="min-w-0">
          <div className="relative mb-3">
            <Icon.search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-brand-black/40"
            />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter endpoints…"
              className="h-10 rounded-full border-brand-black/[0.06] pl-8 sm:text-[12px] shadow-none"
              aria-label="Filter endpoints"
            />
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-brand-black/40">
            <span className="tnum text-brand-black/70">{mockedCount}</span> of{" "}
            <span className="tnum text-brand-black/70">{ENDPOINTS.length}</span> endpoints are
            implemented by the bundled mock. The rest are listed for completeness and
            answer 404 here.
          </p>

          <div className="space-y-4">
            {[...groups.entries()].map(([group, items]) => (
              <div key={group}>
                <div className="label mb-1.5 px-1">{group}</div>
                <ul className="space-y-px">
                  {items.map((e) => (
                    <li key={`${e.method}-${e.path}`}>
                      <button
                        onClick={() => pick(e)}
                        className={`focus-ring w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                          selected.path === e.path && selected.method === e.method
                            ? "bg-brand-black/[0.05]"
                            : "hover:bg-brand-black/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="mono w-11 shrink-0 text-[9.5px] font-semibold tracking-wide"
                            style={{ color: METHOD_COLOR[e.method] }}
                          >
                            {e.method}
                          </span>
                          <span className="mono min-w-0 flex-1 truncate text-[11px] text-brand-black/70">
                            {e.path}
                          </span>
                          {!e.mocked && (
                            <span
                              className="size-1 shrink-0 rounded-full bg-ink-4"
                              title="Not implemented by the mock"
                            />
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <Card>
            <SectionHeader
              title={selected.summary}
              meta={selected.group}
              action={
                <div className="flex gap-1.5">
                  {selected.local && <Badge tone="s2">local extension</Badge>}
                  {selected.mocked ? (
                    <Badge tone="good">mocked</Badge>
                  ) : (
                    <Badge tone="neutral">not mocked</Badge>
                  )}
                </div>
              }
            />
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="mono shrink-0 rounded-md border px-2 py-1.5 text-[11px] font-semibold"
                  style={{
                    color: METHOD_COLOR[selected.method],
                    borderColor: "color-mix(in oklab, var(--brand-black) 12%, transparent)",
                  }}
                >
                  {selected.method}
                </span>
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="mono h-10 min-w-[180px] flex-1 rounded-full text-xs shadow-none"
                  aria-label="Request path"
                />
                <Button variant="primary" onClick={send} disabled={busy} className="rounded-full">
                  {busy && <Spinner />}
                  Send
                </Button>
              </div>

              {path.includes("{") && (
                <p className="text-[11px] text-[color:var(--color-warning)]">
                  Replace the {"{placeholder}"} with a real id — copy one from the
                  memory bank or documents page.
                </p>
              )}

              {selected.method !== "GET" && (
                <div>
                  <label className="label mb-2 block">Request body (JSON)</label>
                  <Textarea
                    rows={10}
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                    className="mono text-[11.5px] leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </Card>

          {err && (
            <Card className="border-[color:var(--color-critical)]/35 px-5 py-3.5">
              <p className="text-xs text-[color:var(--color-critical)]">{err}</p>
            </Card>
          )}

          {res && (
            <Card>
              <SectionHeader
                title="Response"
                meta={
                  <span className="flex items-center gap-2.5">
                    <span
                      className="tnum font-medium"
                      style={{
                        color:
                          res.status < 300
                            ? "var(--color-good)"
                            : res.status < 500
                              ? "var(--color-warning)"
                              : "var(--color-critical)",
                      }}
                    >
                      {res.status}
                    </span>
                    <span className="tnum text-brand-black/40">{res.ms}ms</span>
                  </span>
                }
                action={
                  <Copyable value={JSON.stringify(res.body, null, 2)}>
                    <span className="text-xs text-brand-black/55">Copy JSON</span>
                  </Copyable>
                }
              />
              <pre className="mono max-h-[520px] overflow-auto px-5 py-4 text-[11.5px] leading-relaxed whitespace-pre-wrap text-brand-black/70">
                {JSON.stringify(res.body, null, 2)}
              </pre>
            </Card>
          )}

          <Card>
            <SectionHeader title="Point this console at a real instance" />
            <div className="space-y-3 px-5 py-4 text-xs leading-relaxed text-brand-black/55">
              <p>
                Start the memory engine, then set server-only env vars and restart.
                Route handlers proxy and adapt shapes — the browser never sees the key.
              </p>
              <pre className="mono overflow-x-auto rounded-lg border border-brand-black/[0.06] bg-muted px-3 py-3 text-[11.5px] text-brand-black/70">
{`# terminal 1 — the memory engine
supermemory-server            # serves on http://localhost:6767

# .env.local (gitignored)
SUPERMEMORY_URL=http://localhost:6767
SUPERMEMORY_KEY=sm_your_key

# terminal 2 — this console
npm run dev`}
              </pre>
              <p>
                Leave both unset to keep the bundled mock. See{" "}
                <span className="mono">.env.example</span> for the full list of
                server-only variables.
              </p>
            </div>
          </Card>
        </div>
        </div>
      </PageBody>
    </>
  );
}
