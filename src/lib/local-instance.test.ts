import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  directorySize,
  embeddingsFromEnv,
  llmFromEnv,
  localInstanceConfigured,
  localInstanceDir,
  parseEnvFile,
  parseEtime,
  readLocalInstance,
  resetLocalInstanceCache,
} from "./local-instance";

let dir: string;
const ORIGINAL = process.env.SUPERMEMORY_LOCAL_DIR;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sm-install-"));
  resetLocalInstanceCache();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (ORIGINAL === undefined) delete process.env.SUPERMEMORY_LOCAL_DIR;
  else process.env.SUPERMEMORY_LOCAL_DIR = ORIGINAL;
  resetLocalInstanceCache();
});

describe("parseEnvFile", () => {
  it("reads the installer's quoted form, including escaped quotes", () => {
    // write_env_line emits KEY='value' with ' escaped as '\''.
    const env = parseEnvFile(
      ["OPENAI_API_KEY='sk-abc'", "OPENAI_MODEL='qwen'\\''3'"].join("\n"),
    );
    expect(env.OPENAI_API_KEY).toBe("sk-abc");
    expect(env.OPENAI_MODEL).toBe("qwen'3");
  });

  it("reads hand-appended plain and exported lines", () => {
    const env = parseEnvFile(
      [
        "# a comment",
        "",
        "OPENAI_API_KEY=sk-plain",
        'export OPENAI_BASE_URL="http://localhost:11434/v1"',
        "SUPERMEMORY_EMBEDDING_DIMENSIONS=1024 # inline note",
      ].join("\n"),
    );
    expect(env).toMatchObject({
      OPENAI_API_KEY: "sk-plain",
      OPENAI_BASE_URL: "http://localhost:11434/v1",
      SUPERMEMORY_EMBEDDING_DIMENSIONS: "1024",
    });
  });

  it("ignores lines that are not assignments", () => {
    expect(parseEnvFile("not an assignment\n=novalue\n")).toEqual({});
  });
});

describe("embeddingsFromEnv", () => {
  it("falls back to the documented local defaults", () => {
    expect(embeddingsFromEnv({})).toEqual({
      provider: "local",
      model: "Xenova/bge-base-en-v1.5",
      dimensions: 768,
      local: true,
    });
  });

  it("marks a remote provider as not in-process", () => {
    expect(
      embeddingsFromEnv({
        SUPERMEMORY_EMBEDDING_PROVIDER: "openai",
        SUPERMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
        SUPERMEMORY_EMBEDDING_DIMENSIONS: "1536",
      }),
    ).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      local: false,
    });
  });

  it("ignores an unparseable dimension count", () => {
    expect(
      embeddingsFromEnv({ SUPERMEMORY_EMBEDDING_DIMENSIONS: "many" }).dimensions,
    ).toBe(768);
  });
});

describe("llmFromEnv", () => {
  it("is null when no provider key is configured", () => {
    expect(llmFromEnv({})).toBeNull();
  });

  it("uses the documented default model for plain OpenAI", () => {
    expect(llmFromEnv({ OPENAI_API_KEY: "sk-x" })).toEqual({
      provider: "openai",
      model: "gpt-5.1",
      baseUrl: null,
    });
  });

  it("does not claim OpenAI when a custom base URL is set", () => {
    expect(
      llmFromEnv({
        OPENAI_API_KEY: "ollama",
        OPENAI_BASE_URL: "http://localhost:11434/v1",
        OPENAI_MODEL: "gpt-oss:20b",
      }),
    ).toEqual({
      provider: "openai-compatible",
      model: "gpt-oss:20b",
      baseUrl: "http://localhost:11434/v1",
    });
  });

  it("names other providers without guessing their model", () => {
    expect(llmFromEnv({ ANTHROPIC_API_KEY: "sk-ant" })).toEqual({
      provider: "anthropic",
      model: null,
      baseUrl: null,
    });
  });

  it("never returns a key value", () => {
    const llm = llmFromEnv({ OPENAI_API_KEY: "sk-secret" });
    expect(JSON.stringify(llm)).not.toContain("sk-secret");
  });
});

describe("parseEtime", () => {
  it("reads every ps elapsed-time form", () => {
    expect(parseEtime("07:12")).toBe(432);
    expect(parseEtime("01:07:12")).toBe(4032);
    expect(parseEtime("4-01:07:12")).toBe(349_632);
  });

  it("rejects anything else", () => {
    expect(parseEtime("TIME")).toBeNull();
    expect(parseEtime("")).toBeNull();
  });
});

describe("directorySize", () => {
  it("sums files recursively", async () => {
    await mkdir(path.join(dir, "graph"));
    await writeFile(path.join(dir, "graph", "a"), "x".repeat(100));
    await writeFile(path.join(dir, "b"), "y".repeat(50));
    expect(await directorySize(dir)).toBe(150);
  });

  it("skips excluded top-level directories only", async () => {
    await mkdir(path.join(dir, "bin"));
    await writeFile(path.join(dir, "bin", "server"), "x".repeat(900));
    await mkdir(path.join(dir, "graph", "bin"), { recursive: true });
    await writeFile(path.join(dir, "graph", "bin", "page"), "y".repeat(10));
    expect(await directorySize(dir, new Set(["bin"]))).toBe(10);
  });

  it("is null when the directory cannot be read", async () => {
    expect(await directorySize(path.join(dir, "missing"))).toBeNull();
  });
});

describe("readLocalInstance", () => {
  it("stays off until SUPERMEMORY_LOCAL_DIR is set", async () => {
    delete process.env.SUPERMEMORY_LOCAL_DIR;
    expect(localInstanceConfigured()).toBe(false);
    expect(localInstanceDir()).toBeNull();
    expect(await readLocalInstance()).toBeNull();
  });

  it("is null when the configured directory does not exist", async () => {
    process.env.SUPERMEMORY_LOCAL_DIR = path.join(dir, "nope");
    expect(await readLocalInstance()).toBeNull();
  });

  it("reads version, models and storage off the install directory", async () => {
    const data = path.join(dir, "state");
    await mkdir(path.join(dir, "bin"), { recursive: true });
    await mkdir(data);
    await writeFile(
      path.join(dir, "bin", "supermemory-server.version"),
      "0.0.1-rc.4\n",
    );
    await writeFile(path.join(dir, "bin", "supermemory-server"), "binary");
    await writeFile(
      path.join(dir, "env"),
      [
        "OPENAI_API_KEY='sk-secret'",
        "OPENAI_BASE_URL='http://localhost:11434/v1'",
        "OPENAI_MODEL='gpt-oss:20b'",
        `SUPERMEMORY_DATA_DIR='${data}'`,
      ].join("\n"),
    );
    await writeFile(path.join(data, "graph.db"), "z".repeat(2048));

    process.env.SUPERMEMORY_LOCAL_DIR = dir;
    const local = await readLocalInstance();

    expect(local).toMatchObject({
      dir,
      version: "0.0.1-rc.4",
      embeddings: { model: "Xenova/bge-base-en-v1.5", local: true },
      llm: { provider: "openai-compatible", model: "gpt-oss:20b" },
      storage: { engine: "embedded graph", sizeBytes: 2048, path: data },
    });
    expect(JSON.stringify(local)).not.toContain("sk-secret");
  });

  it("measures the install directory itself when no data dir is configured", async () => {
    await mkdir(path.join(dir, "bin"), { recursive: true });
    // The binary and its download cache are not state.
    await writeFile(path.join(dir, "bin", "supermemory-server"), "x".repeat(500));
    await writeFile(path.join(dir, "graph.db"), "z".repeat(64));

    process.env.SUPERMEMORY_LOCAL_DIR = dir;
    const local = await readLocalInstance();

    expect(local?.storage).toMatchObject({ path: dir, sizeBytes: 64 });
    expect(local?.version).toBeNull();
  });

  it("names postgres as the engine when one is configured", async () => {
    await writeFile(
      path.join(dir, "env"),
      "DATABASE_URL='postgresql://localhost:5432/supermemory'",
    );
    process.env.SUPERMEMORY_LOCAL_DIR = dir;
    expect((await readLocalInstance())?.storage?.engine).toBe(
      "postgres + pgvector",
    );
  });
});
