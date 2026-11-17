import localFont from "next/font/local";

/**
 * Self-hosted variable fonts (vendored woff2 in `public/fonts/`, see its
 * README). `next/font/local` self-hosts them — no CLS, no third-party request,
 * CSP-safe. Each exposes a CSS variable consumed by the `@theme` font families in
 * `globals.css` and the `--kb-font-*` stacks in `kb-tokens.css`:
 *   `--font-source`     → font-sans / --kb-font-body (Source Sans 3, body/UI)
 *   `--font-fraunces`   → font-display / --kb-font-display (headings + stat numerals)
 *   `--font-jetbrains`  → font-mono / --kb-font-mono (data / eyebrows / tokens)
 *   `--font-pretendard` → the Korean (Hangul) fallback that ends every stack
 *
 * The Knowledge Base "calm editorial library" design system: a serif display
 * face (Fraunces) over a clean sans body (Source Sans 3), with JetBrains Mono for
 * data — replacing the placeholder skin's accent face. The FULL Pretendard face
 * (not a subset) stays as the Korean fallback — knowledge renders unbounded
 * operator/agent-authored Korean (doc titles, project names) no subset covers.
 */

export const pretendard = localFont({
  // FULL Pretendard variable face (~2.0 MB), NOT a content-derived subset:
  // knowledge renders unbounded Korean (operator/agent-authored doc titles,
  // project names), so every syllable resolves to the brand Hangul face rather
  // than a system fallback. The full `45 920` weight axis is intact.
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

// Fraunces — the editorial display serif: all headings + the stat-tile numerals
// (DECISION #1), with `font-optical-sizing: auto` engaging the opsz axis.
export const fraunces = localFont({
  src: "../../public/fonts/Fraunces.woff2",
  variable: "--font-fraunces",
  weight: "400 700",
  display: "swap",
});

// Source Sans 3 — the body / UI sans face.
export const source = localFont({
  src: "../../public/fonts/SourceSans3.woff2",
  variable: "--font-source",
  weight: "200 900",
  display: "swap",
});

export const jetbrains = localFont({
  src: "../../public/fonts/JetBrainsMono.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

/*
 * The hi2vi design system's three faces (`public/fonts/plex/`, see the fonts README): IBM Plex Sans,
 * IBM Plex Sans KR and IBM Plex Mono, static weights only, the ones the system sets. Their variables
 * are read by `src/hi2vi/styles/tokens.css` (`--font-sans`, `--font-mono`) inside a `.ui` root and
 * nowhere else, so the old pages keep the faces above.
 *
 * `preload: false`: a root-layout font preloads on every route, and only `.ui` pages use these, so an
 * old page fetches none of them. `adjustFontFallback: false`: each variable then names its face alone,
 * so the stacks in tokens.css read exactly as the signed ones do (Plex Sans, then Plex Sans KR for the
 * Hangul Plex Sans lacks, then system-ui), with no metric-adjusted Arial between the two Plex faces.
 */
export const plexSans = localFont({
  src: [
    {
      path: "../../public/fonts/plex/IBMPlexSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/plex/IBMPlexSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/plex/IBMPlexSans-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const plexSansKr = localFont({
  src: [
    {
      path: "../../public/fonts/plex/IBMPlexSansKR-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/plex/IBMPlexSansKR-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/plex/IBMPlexSansKR-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-sans-kr",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const plexMono = localFont({
  src: [
    {
      path: "../../public/fonts/plex/IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/plex/IBMPlexMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
