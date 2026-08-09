import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // dayKey / dayLabel use local calendar days; pin so CI is timezone-stable.
    env: {
      TZ: "UTC",
    },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Storybook documents the design system; `build-storybook` is its check.
        "src/**/*.stories.tsx",
        "src/stories/**",
        // Test files and their helpers.
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        // Type-only and static declaration modules.
        "src/lib/types.ts",
        "src/lib/endpoints.ts",
        "src/app/**/{layout,page}.tsx",
      ],
      /**
       * A ratchet, not a target: each number sits just under what the suite
       * covers today, so an uncovered regression fails CI. Raise them as
       * coverage grows rather than lowering them to make a build pass.
       *
       * The global figures are low because components and route screens have
       * no tests at all — they need a DOM environment this project does not
       * configure yet. The per-path entries below are where the contract and
       * the memory semantics live, and they are held to a much higher bar.
       */
      thresholds: {
        statements: 29,
        branches: 25,
        functions: 23,
        lines: 29,
        "src/lib/store.ts": {
          statements: 85,
          branches: 80,
          functions: 90,
          lines: 85,
        },
        "src/lib/remote.ts": {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        "src/lib/live.ts": {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
        "src/lib/tags.ts": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
        "src/lib/seed.ts": {
          statements: 90,
          branches: 85,
          functions: 95,
          lines: 95,
        },
        "src/app/api/**": {
          statements: 40,
          branches: 32,
          functions: 32,
          lines: 40,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      // Next.js resolves this marker internally; Vitest needs a no-op module
      // so server modules remain directly unit-testable outside Next.
      "server-only": path.resolve(root, "./src/test/server-only.ts"),
    },
  },
});
