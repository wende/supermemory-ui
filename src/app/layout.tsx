import type { Metadata, Viewport } from "next";
import { Lexend_Exa } from "next/font/google";
import { RouteHost } from "@/components/route-host";
import { Shell } from "@/components/shell";
import {
  ACCENT_STORAGE_KEY,
  ACCENT_THEME_IDS,
  DEFAULT_ACCENT_THEME,
} from "@/lib/accent-theme";
import "./globals.css";

const lexendExa = Lexend_Exa({
  subsets: ["latin"],
  weight: ["200"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "supermemory local — memory console",
  description:
    "An open-source window into a locally running supermemory backend: memory bank, ingestion, hybrid recall and the memory graph.",
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9.2" fill="none" stroke="#1fa0b5" stroke-width="1.6"/><circle cx="11" cy="11" r="3.4" fill="#1fa0b5"/></svg>`,
          ),
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9FAFB" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
};

// The allowed IDs and the default come from the accent registry so adding a
// theme stays a one-file change — this script is inlined before paint to avoid
// a flash of the wrong accent.
const themeScript = `
(() => {
  const accents = ${JSON.stringify(ACCENT_THEME_IDS)};
  const fallback = ${JSON.stringify(DEFAULT_ACCENT_THEME)};
  try {
    const root = document.documentElement;
    const stored = localStorage.getItem("supermemory-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", stored === "dark" || (!stored && prefersDark));

    const accent = localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});
    root.dataset.accent = accents.indexOf(accent) === -1 ? fallback : accent;
  } catch {
    document.documentElement.dataset.accent = fallback;
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-accent={DEFAULT_ACCENT_THEME}
      className={lexendExa.variable}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <Shell>
          <RouteHost>{children}</RouteHost>
        </Shell>
      </body>
    </html>
  );
}
