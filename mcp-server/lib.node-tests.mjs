import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  createMemory,
  localApi,
  normalizeGitRemote,
  resolveRepositorySpace,
} from "./lib.mjs";

const run = promisify(execFile);

test("normalizeGitRemote preserves case for local filesystem identities", () => {
  assert.equal(
    normalizeGitRemote("file:///Volumes/Work/Project.git"),
    "file:/Volumes/Work/Project",
  );
  assert.notEqual(
    normalizeGitRemote("/Volumes/Work/Project"),
    normalizeGitRemote("/Volumes/Work/project"),
  );
});

test("normalizeGitRemote canonicalizes hosted remotes", () => {
  assert.equal(
    normalizeGitRemote("git@GitHub.com:SupermemoryAI/Supermemory.git"),
    "github.com/supermemoryai/supermemory",
  );
  assert.equal(
    normalizeGitRemote("https://GitHub.com/SupermemoryAI/Supermemory.git"),
    "github.com/supermemoryai/supermemory",
  );
});

test("createMemory uses direct memory creation with bearer auth", async () => {
  let request;
  const response = await createMemory(
    {
      content: "Remember this",
      containerTag: "repo_test",
      isStatic: false,
    },
    {
      apiUrl: "http://engine.local/",
      apiKey: "sm_test",
      fetchImpl: async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({ memories: [{ id: "mem_1" }] }));
      },
    },
  );

  assert.equal(request.url, "http://engine.local/v4/memories");
  assert.equal(request.init.headers.Authorization, "Bearer sm_test");
  assert.equal(request.init.headers["x-sm-source"], "supermemory-local-mcp");
  assert.deepEqual(JSON.parse(request.init.body), {
    memories: [
      {
        content: "Remember this",
        isStatic: false,
        metadata: { sm_source: "supermemory-local-mcp" },
      },
    ],
    containerTag: "repo_test",
  });
  assert.deepEqual(response, { memories: [{ id: "mem_1" }] });
});

test("localApi omits bearer auth when the engine key is absent", async () => {
  let headers;
  await localApi("/v3/documents/list", {}, "POST", {
    apiKey: "",
    fetchImpl: async (_url, init) => {
      headers = init.headers;
      return new Response("{}");
    },
  });

  assert.equal(headers.Authorization, undefined);
});

test("localApi reports non-success responses with bounded context", async () => {
  await assert.rejects(
    localApi("/v4/search", {}, "POST", {
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    }),
    /Local API \/v4\/search returned 401: unauthorized/,
  );
});

test("resolveRepositorySpace uses the normalized origin asynchronously", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "supermemory-mcp-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, "Checkout");
  const nested = join(repo, "src");
  await mkdir(nested, { recursive: true });
  await run("git", ["init", "-q", repo]);
  await run("git", [
    "-C",
    repo,
    "remote",
    "add",
    "origin",
    "git@GitHub.com:Owner/Repo.git",
  ]);

  const resolved = await resolveRepositorySpace(nested, false);

  assert.equal(resolved.repositoryPath, repo);
  assert.equal(resolved.repositoryName, "Repo");
  assert.equal(resolved.normalizedRemote, "github.com/owner/repo");
  assert.match(resolved.containerTag, /^repo_repo__[a-f0-9]{16}$/);
});
