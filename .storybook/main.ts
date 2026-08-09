import type { StorybookConfig } from "@storybook/nextjs-vite";

/**
 * Storybook is the design-system workbench for the console.
 *
 * Stories live next to the components they document (`src/components/**`),
 * while the cross-cutting foundation and pattern pages live in
 * `src/stories/`. Both are picked up by the globs below.
 */
const config: StorybookConfig = {
  stories: [
    "../src/stories/**/*.mdx",
    "../src/stories/**/*.stories.@(ts|tsx)",
    "../src/components/**/*.stories.@(ts|tsx)",
  ],

  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
  ],

  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },

  core: {
    disableTelemetry: true,
  },

  viteFinal(config) {
    // Every component in this codebase is a Next.js client component, so the
    // bundler sees a "use client" directive at the top of almost every file
    // and warns that it dropped it. That is expected here — Storybook renders
    // them on the client already — so the warning is pure noise.
    config.build ??= {};
    config.build.rollupOptions ??= {};
    const inherited = config.build.rollupOptions.onwarn;
    config.build.rollupOptions.onwarn = (warning, warn) => {
      if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
      if (inherited) inherited(warning, warn);
      else warn(warning);
    };
    return config;
  },

  // Prop tables are read from the TS types, which is where this codebase
  // documents its component contracts.
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
};

export default config;
