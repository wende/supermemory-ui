import * as React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import { DEFAULT_ACCENT_THEME } from "../src/lib/accent-theme";

// The single source of truth for every token, utility and keyframe the
// components use. Importing it here is what makes a story look like the app.
import "../src/app/globals.css";
import "./storybook.css";

const preview: Preview = {
  parameters: {
    layout: "padded",

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true,
    },

    // The theme decorator paints the canvas via `--background`, so Storybook's
    // own background switcher would only fight it.
    backgrounds: { disable: true },

    options: {
      storySort: {
        order: [
          "Foundations",
          [
            "Introduction",
            "Colour",
            "Typography",
            "Surfaces",
            "Motion",
            "Iconography",
            "Formatting",
          ],
          "Primitives",
          "Console Kit",
          "Blocks",
          "Charts",
          "Graph",
          "Layout",
          "Patterns",
          "*",
        ],
      },
    },

    docs: {
      toc: true,
    },

    // Components that call `usePathname()` / `useSearchParams()` need the App
    // Router shims rather than the Pages Router ones.
    nextjs: {
      appDirectory: true,
    },
  },

  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
      parentSelector: "html",
    }),

    // Ship the same accent pack as the app (`data-accent="te-orange"`).
    (Story) => {
      if (typeof document !== "undefined") {
        document.documentElement.dataset.accent = DEFAULT_ACCENT_THEME;
      }
      return (
        <div className="font-sans text-brand-black antialiased">
          <Story />
        </div>
      );
    },
  ],

  tags: ["autodocs"],
};

export default preview;
