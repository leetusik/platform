// Site-level brand + metadata. Single source for the wordmark and the
// title/description used by the Metadata API (wired in layout.tsx). The app is
// Korean-first (root lang="ko", matching hi2vi_web), rendered in the full
// Pretendard face. `url` reads the deploy env var and falls back to a local-dev
// origin (production origin is a P14 deploy concern).
import type { SiteMeta } from "./types";

//
// The tab title and the description name sikstack (operator, OQ15). The description is the landing's signed
// title sentence (job 06-landing round 01); the landing itself sets its own absolute title.
export const SITE: SiteMeta = {
  name: "sikstack",
  title: "sikstack",
  titleTemplate: "%s · sikstack",
  description: "One place for your project’s work with its coding agents.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3030",
};

/**
 * Brand mark for the Knowledge Base design system: the book-spark logo (teal
 * `logo.svg`, self-hosted under `/public`) beside the lowercase "knowledge"
 * wordmark set in the display serif (Fraunces). No colored initial — the mark
 * carries the identity, the wordmark stays ink. Used by the app-shell topbar
 * (light) and the login gate brand row (dark); both serve `logo` from the app.
 */
export const BRAND = {
  wordmark: "knowledge",
  logo: "/logo.svg",
} as const;
