/**
 * Same-machine introspection for a self-hosted supermemory instance.
 *
 * The Memory API exposes no runtime metadata. There is no `/health`, `/status`
 * or `/version` route in the published surface, and the official launcher's
 * own `supermemory local status` only performs a bare GET on the root URL and
 * reports the HTTP code — it reads the installed version from a file on disk,
 * not from the server. So version, uptime, model configuration and storage
 * size cannot be proxied; they can only be observed locally.
 *
 * When the console runs on the same host as `supermemory-server`, those facts
 * are on disk. The installer (https://supermemory.ai/install) writes:
 *
 *   <install>/bin/supermemory-server            the binary
 *   <install>/bin/supermemory-server.version    plain-text version
 *   <install>/env                               KEY='value' lines, mode 600
 *   <install>/downloads/                        verified download cache
 *
 * and the graph engine writes its state to `SUPERMEMORY_DATA_DIR`, defaulting
 * to `./.supermemory` in the server's working directory.
 *
 * Opt-in: nothing here runs unless `SUPERMEMORY_LOCAL_DIR` is set, so hosted
 * deployments are untouched.
 *
 * `<install>/env` holds provider API keys. Only provider names, model names
 * and base URLs ever leave this module — key values are read to determine
 * which provider is configured and then dropped.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ServerInfo } from "./types";

/** Documented defaults from /docs/self-hosting/configuration. */
const DEFAULT_EMBEDDING_MODEL = "Xenova/bge-base-en-v1.5";
const DEFAULT_EMBEDDING_DIMENSIONS = 768;
const DEFAULT_OPENAI_MODEL = "gpt-5.1";

/** Written by the installer; not state, so excluded from the size roll-up. */
const NON_STATE_DIRS = new Set(["bin", "downloads"]);

/** Directory walks are bounded — a data dir can hold a lot of small files. */
const MAX_ENTRIES = 50_000;
const MAX_DEPTH = 8;

/** Health is polled; re-reading the tree on every request would be rude. */
const TTL_MS = 15_000;

export interface LocalInstance {
  /** The install directory that was actually read. */
  dir: string;
  version: string | null;
  uptimeSeconds: number | null;
  embeddings: ServerInfo["embeddings"];
  llm: ServerInfo["llm"];
  storage: ServerInfo["storage"];
}

/**
 * The configured install directory, or null when same-machine introspection
 * is switched off. `~` is expanded so the value can be written the way the
 * docs print it.
 */
export function localInstanceDir(): string | null {
  const raw = process.env.SUPERMEMORY_LOCAL_DIR?.trim();
  if (!raw) return null;
  const expanded =
    raw === "~" || raw.startsWith("~/") ? path.join(homedir(), raw.slice(1)) : raw;
  return path.resolve(expanded);
}

export function localInstanceConfigured(): boolean {
  return localInstanceDir() != null;
}

/* ------------------------------------------------------------------ */
/* env file                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse the installer's env file. It writes `KEY='value'` with POSIX
 * single-quote escaping, but the docs also tell people to append plain
 * `KEY=value` lines by hand, so accept both (and `export KEY=…`).
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rest] = match;
    out[key] = unquote(rest);
  }
  return out;
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
    // The installer escapes an embedded quote as '\'' — undo that.
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    return value.slice(1, -1).replace(/\\(["\\$`])/g, "$1");
  }
  // Unquoted values run to the first unescaped comment.
  return value.replace(/\s+#.*$/, "").trim();
}

async function readEnvFile(dir: string): Promise<Record<string, string>> {
  let fromFile: Record<string, string> = {};
  try {
    fromFile = parseEnvFile(await readFile(path.join(dir, "env"), "utf8"));
  } catch {
    // No env file — fall through to this process's environment.
  }
  // The installer's wrapper sources the env file with `set -a` immediately
  // before exec'ing the binary, so the file wins over anything inherited.
  // Our own environment is only a fallback for keys the file does not set.
  const merged: Record<string, string> = {};
  for (const key of ENV_KEYS) {
    const value = fromFile[key] ?? process.env[key];
    if (value != null && value !== "") merged[key] = value;
  }
  return merged;
}

/** Read-list, so an unrelated secret in the env file is never even loaded. */
const ENV_KEYS = [
  "SUPERMEMORY_DATA_DIR",
  "SUPERMEMORY_EMBEDDING_PROVIDER",
  "SUPERMEMORY_EMBEDDING_MODEL",
  "SUPERMEMORY_EMBEDDING_DIMENSIONS",
  "SUPERMEMORY_EMBEDDING_BASE_URL",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_TEXT_MODEL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "WORKERS_AI_API_KEY",
  "GOOGLE_VERTEX_PROJECT_ID",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

/* ------------------------------------------------------------------ */
/* Derivations                                                         */
/* ------------------------------------------------------------------ */

export function embeddingsFromEnv(
  env: Record<string, string>,
): NonNullable<ServerInfo["embeddings"]> {
  const provider = env.SUPERMEMORY_EMBEDDING_PROVIDER || "local";
  const dimensions = Number(env.SUPERMEMORY_EMBEDDING_DIMENSIONS);
  return {
    provider,
    model: env.SUPERMEMORY_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    dimensions: Number.isFinite(dimensions) && dimensions > 0
      ? dimensions
      : DEFAULT_EMBEDDING_DIMENSIONS,
    local: provider === "local",
  };
}

/**
 * Which LLM provider the server will pick, from the keys that are present.
 * Only the presence of a key is used — never its value.
 */
export function llmFromEnv(env: Record<string, string>): ServerInfo["llm"] {
  const baseUrl = env.OPENAI_BASE_URL || null;
  const model = env.OPENAI_MODEL || env.OPENAI_TEXT_MODEL || null;

  if (env.OPENAI_API_KEY || baseUrl) {
    return {
      // A custom base URL means OpenAI's wire format against something else
      // (Ollama, LM Studio, OpenRouter). Naming it "openai" would be wrong.
      provider: baseUrl ? "openai-compatible" : "openai",
      model: model ?? (baseUrl ? null : DEFAULT_OPENAI_MODEL),
      baseUrl,
    };
  }
  if (env.ANTHROPIC_API_KEY) return { provider: "anthropic", model, baseUrl };
  if (env.GEMINI_API_KEY) return { provider: "gemini", model, baseUrl };
  if (env.GROQ_API_KEY) return { provider: "groq", model, baseUrl };
  if (env.WORKERS_AI_API_KEY) return { provider: "workers-ai", model, baseUrl };
  if (env.GOOGLE_VERTEX_PROJECT_ID) return { provider: "vertex", model, baseUrl };
  return null;
}

/**
 * Where the graph engine keeps state. `SUPERMEMORY_DATA_DIR` is authoritative;
 * without it the default is `./.supermemory` relative to the server's working
 * directory, which we cannot see — so try the two placements that actually
 * occur: a nested `.supermemory` under the install dir, or the install dir
 * itself (what you get when the wrapper is started from `$HOME`).
 */
async function resolveDataDir(dir: string, env: Record<string, string>) {
  const configured = env.SUPERMEMORY_DATA_DIR;
  if (configured) {
    const resolved = path.resolve(
      configured.startsWith("~/") ? path.join(homedir(), configured.slice(1)) : configured,
    );
    return { path: resolved, isInstallDir: resolved === dir, configured: true };
  }
  const nested = path.join(dir, ".supermemory");
  if (await isDirectory(nested)) {
    return { path: nested, isInstallDir: false, configured: false };
  }
  return { path: dir, isInstallDir: true, configured: false };
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Bytes on disk under `root`, following no symlinks and skipping `exclude`
 * at the top level. Bounded by entry count and depth so a pathological tree
 * cannot stall a health check.
 */
export async function directorySize(
  root: string,
  exclude: Set<string> = new Set(),
): Promise<number | null> {
  let total = 0;
  let seen = 0;
  let reachedRoot = false;

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || seen >= MAX_ENTRIES) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
      reachedRoot = true;
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= MAX_ENTRIES) return;
      if (depth === 0 && exclude.has(entry.name)) continue;
      seen += 1;
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          total += (await stat(full)).size;
        } catch {
          // Raced with a compaction; skip it.
        }
      }
    }
  }

  await walk(root, 0);
  return reachedRoot ? total : null;
}

/**
 * Seconds since `supermemory-server` started, read from the process table.
 *
 * `ps` is invoked with a fixed argument list and no shell, and only runs when
 * same-machine introspection is explicitly enabled.
 */
export async function serverUptimeSeconds(): Promise<number | null> {
  try {
    const { execFile } = await import("node:child_process");
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "ps",
        ["-Ao", "etime=,comm="],
        { timeout: 1500, maxBuffer: 8 << 20 },
        (error, out) => (error ? reject(error) : resolve(out)),
      );
    });
    for (const line of stdout.split("\n")) {
      const match = /^\s*(\S+)\s+(.+)$/.exec(line);
      if (!match) continue;
      // Linux truncates `comm` to 15 characters: "supermemory-ser".
      if (!match[2].includes("supermemory-ser")) continue;
      const seconds = parseEtime(match[1]);
      if (seconds != null) return seconds;
    }
  } catch {
    // No ps, not permitted, or the server is not running here.
  }
  return null;
}

/** `[[dd-]hh:]mm:ss`, as printed by both BSD and procps `ps`. */
export function parseEtime(value: string): number | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(value.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

let cache: { at: number; value: LocalInstance | null } | null = null;

/**
 * Everything the install directory can tell us, or null when introspection
 * is disabled or the directory does not look like a supermemory install.
 */
export async function readLocalInstance(): Promise<LocalInstance | null> {
  const dir = localInstanceDir();
  if (!dir) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const value = await load(dir);
  cache = { at: Date.now(), value };
  return value;
}

/** Test seam — the cache is process-lifetime otherwise. */
export function resetLocalInstanceCache(): void {
  cache = null;
}

async function load(dir: string): Promise<LocalInstance | null> {
  if (!(await isDirectory(dir))) return null;

  const env = await readEnvFile(dir);
  const version = await readVersion(dir);
  const data = await resolveDataDir(dir, env);
  const [sizeBytes, uptimeSeconds] = await Promise.all([
    directorySize(data.path, data.isInstallDir ? NON_STATE_DIRS : new Set()),
    serverUptimeSeconds(),
  ]);

  const postgres = env.DATABASE_URL || env.POSTGRES_URL || "";
  const engine = /^postgres(ql)?:/i.test(postgres)
    ? "postgres + pgvector"
    : "embedded graph";

  return {
    dir,
    version,
    uptimeSeconds,
    embeddings: embeddingsFromEnv(env),
    llm: llmFromEnv(env),
    storage:
      sizeBytes == null ? null : { engine, sizeBytes, path: data.path },
  };
}

async function readVersion(dir: string): Promise<string | null> {
  try {
    const text = await readFile(
      path.join(dir, "bin", "supermemory-server.version"),
      "utf8",
    );
    return text.trim() || null;
  } catch {
    return null;
  }
}
