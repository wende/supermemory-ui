import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function localApi(
  path,
  body,
  method = "POST",
  {
    apiUrl = process.env.SUPERMEMORY_LOCAL_API_URL ?? "http://127.0.0.1:6767",
    apiKey = process.env.SUPERMEMORY_API_KEY ?? "",
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const baseUrl = apiUrl.replace(/\/$/, "");
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "x-sm-source": "supermemory-local-mcp",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Local API ${path} returned ${response.status}: ${text.slice(0, 400)}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

export async function createMemory(
  { content, containerTag, isStatic },
  requestOptions,
) {
  return localApi(
    "/v4/memories",
    {
      memories: [
        {
          content,
          ...(isStatic !== undefined ? { isStatic } : {}),
          metadata: { sm_source: "supermemory-local-mcp" },
        },
      ],
      containerTag,
    },
    "POST",
    requestOptions,
  );
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function sanitizeRepoName(name) {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return sanitized.slice(0, 95).replace(/_+$/g, "") || "unknown";
}

async function git(directory, args) {
  const { stdout } = await execFile("git", ["-C", directory, ...args], {
    encoding: "utf8",
  });
  return stdout.trim();
}

async function getGitRoot(directory, isolateWorktrees) {
  if (isolateWorktrees) {
    return git(directory, ["rev-parse", "--show-toplevel"]);
  }

  const commonDir = await git(directory, ["rev-parse", "--git-common-dir"]);
  if (commonDir === ".git") {
    return git(directory, ["rev-parse", "--show-toplevel"]);
  }

  const commonDirPath = resolve(directory, commonDir);
  if (
    basename(commonDirPath) === ".git" &&
    !commonDirPath.includes(`${sep}.git${sep}`)
  ) {
    return dirname(commonDirPath);
  }
  return git(directory, ["rev-parse", "--show-toplevel"]);
}

export function normalizeGitRemote(remoteUrl) {
  const raw = remoteUrl.trim();
  if (!raw) return null;

  let normalized;
  let preservePathCase = false;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "file:") {
        normalized = `file:${decodeURIComponent(parsed.pathname)}`;
        preservePathCase = true;
      } else {
        normalized = `${parsed.hostname.toLowerCase()}${
          parsed.port ? `:${parsed.port}` : ""
        }/${parsed.pathname.replace(/^\/+/, "")}`;
      }
    } catch {
      normalized = raw;
    }
  } else {
    const scpStyle = raw.match(/^(?:[^@/]+@)?([^:]+):(.+)$/);
    if (scpStyle) {
      normalized = `${scpStyle[1].toLowerCase()}/${scpStyle[2]}`;
    } else {
      normalized = `file:${resolve(raw)}`;
      preservePathCase = true;
    }
  }

  const cleaned = normalized
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/{2,}/g, "/");
  return preservePathCase ? cleaned : cleaned.toLowerCase();
}

export async function resolveRepositorySpace(repositoryPath, isolateWorktrees) {
  const requestedPath = resolve(repositoryPath);
  const basePath = await getGitRoot(requestedPath, isolateWorktrees);
  let localIdentity = basePath;
  try {
    localIdentity = realpathSync.native(basePath);
  } catch {
    // Use the Git root if resolving symlinks is unavailable.
  }

  let remoteUrl = null;
  try {
    remoteUrl = await git(basePath, ["remote", "get-url", "origin"]);
  } catch {
    // A repository without an origin is intentionally scoped to its local path.
  }

  const normalizedRemote = remoteUrl ? normalizeGitRemote(remoteUrl) : null;
  const repoName = remoteUrl
    ? remoteUrl
        .replace(/\/+$/, "")
        .replace(/\.git$/i, "")
        .split(/[/:]/)
        .at(-1)
    : basename(basePath);
  const shortName = sanitizeRepoName(repoName)
    .slice(0, 72)
    .replace(/_+$/g, "");
  const identity =
    !isolateWorktrees && normalizedRemote
      ? normalizedRemote
      : `path:${localIdentity}`;

  return {
    containerTag: `repo_${shortName || "unknown"}__${sha256(identity)}`,
    repositoryPath: basePath,
    repositoryName: repoName || "unknown",
    identitySource:
      !isolateWorktrees && normalizedRemote
        ? "origin remote"
        : "resolved local path",
    ...(normalizedRemote ? { normalizedRemote } : {}),
  };
}
