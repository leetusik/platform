# Self-hosted fonts

Vendored woff2 (committed to the repo). Wired via `src/lib/fonts.ts`
(`next/font/local`). Do **not** hotlink — these are self-hosted on purpose (no
CLS, no third-party request, CSP-safe).

The app wears the **Knowledge Base "calm editorial library"** design system
(P12.S2R): a serif display face (Fraunces) over a clean sans body (Source Sans
3), with JetBrains Mono for data. The **full** Pretendard face (not a subset)
stays as the Korean (Hangul) fallback that ends every stack — knowledge renders
unbounded operator/agent-authored Korean (doc titles, project names) that no
fixed subset could cover.

| File | Source (npm) | Weight axis | Role |
|---|---|---|---|
| `SourceSans3.woff2` | `@fontsource-variable/source-sans-3` | `200 900` | Body / UI → `--font-source` / `font-sans` / `--kb-font-body` |
| `Fraunces.woff2` | `@fontsource-variable/fraunces` | `400 700` (opsz) | Display / headings + stat numerals → `--font-fraunces` / `font-display` / `--kb-font-display` |
| `JetBrainsMono.woff2` | `@fontsource-variable/jetbrains-mono` | `100 800` | Code / mono / eyebrows / tokens → `--font-jetbrains` / `font-mono` / `--kb-font-mono` |
| `PretendardVariable.woff2` | `pretendard` (1.3.9) | `45 920` | Korean (Hangul) fallback → `--font-pretendard` (full face, ~2.0 MB) |

All are OFL-licensed and free to self-host.

## Why the full Pretendard face (not a subset)

The public marketing pattern serves a content-derived subset because its copy is
a fixed, known glyph set. knowledge is different: it renders **unbounded** Korean
authored by operators and agents (document titles, project names, search text),
so any fixed subset would drop to the system fallback the moment new syllables
appear. We therefore serve the full `PretendardVariable.woff2` (~2.0 MB, full
`45 920` weight axis). If a page's LCP later needs a lighter critical path, a
runtime subset can be revisited at the P14 design/deploy gate.

## Re-vendoring / updating

```bash
pnpm add -D @fontsource-variable/source-sans-3 @fontsource-variable/fraunces @fontsource-variable/jetbrains-mono pretendard
# copy the files (see paths in node_modules/.pnpm/...) into this folder, then:
pnpm remove @fontsource-variable/source-sans-3 @fontsource-variable/fraunces @fontsource-variable/jetbrains-mono pretendard
```

## The reader's reading faces (`public/fonts/reader/`, P30.S13)

Two more OFL faces, vendored as Google Fonts' own woff2 **unicode-range subsets** (not wired through
`next/font`, which cannot carry `unicode-range`): `src/app/reader-fonts.css` declares them, and only the reader's
client frame imports it, so no other page pays for them. A page loads just the subsets its text uses.

| Files | Face | Axes | Role |
|---|---|---|---|
| `literata-{normal,italic}-sNNN.woff2` (14) | Literata (OFL) | `wght` 400–700, roman and italic | `--font-reading`: the chapter's body text |
| `notoserifkr-normal-sNNN.woff2` (124) | Noto Serif KR (OFL 1.1) | `wght` 200–900 | Hangul in the reading and display faces (`01-reader` round 02, *Faces*) |

The subset files are numbered in the order Google's CSS lists them; the `unicode-range` of each is in
`reader-fonts.css`. To refresh: fetch `https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&display=swap`
and `…?family=Noto+Serif+KR:wght@200..900&display=swap` with a modern Chrome user agent, download each `woff2`, and
regenerate the CSS. Do not hotlink.

## The reader's math face (`public/fonts/reader/stix-two-math.woff2`, P39-hk.S8)

| File | Face | Source | Role |
|---|---|---|---|
| `stix-two-math.woff2` (403,344 bytes) | STIX Two Math 2.12 (OFL 1.1; Reserved Font Name "TM Math"; "STIX Fonts" is an IEEE trademark) | `@fontsource/stix-two-math` 5.3.0, `files/stix-two-math-latin-400-normal.woff2`: Google Fonts' file, **unmodified**, the whole `cmap` and the `MATH` table | `--font-math`: every formula in the reader and on paper (`10-reading-aids` frame F8) |

`stix-two-math-OFL.txt` beside it is the licence as that package ships it. `reader-fonts.css` declares one
`@font-face` with `local("STIX Two Math")` first (macOS and iOS ship it), then the file, so a page fetches it only
when it shows math. Never subset or rename it in place: a cut file is a Modified Version under the OFL and may not
be called "TM Math" (R1 left a 157 KB `pyftsubset` cut, `MATH` kept, as a later option gated on a coverage check).
To refresh: `npm pack @fontsource/stix-two-math`, copy that one `woff2` here and check it still carries `MATH`.

## The hi2vi design system's faces (`public/fonts/plex/`)

IBM Plex, vendored from IBM's own npm packages (the `ibm/plex` repository's releases): the static
`fonts/complete/woff2/` files, unmodified, only the weights the system sets. Wired through
`next/font/local` in `src/lib/fonts.ts` as `--font-plex-sans`, `--font-plex-sans-kr` and `--font-plex-mono`,
which `src/hi2vi/styles/tokens.css` reads inside a `.ui` root only. `preload: false`: an old page fetches
none of them. No request goes to a font host at runtime.

| Files | Face | Weights | Source |
|---|---|---|---|
| `IBMPlexSans-{Regular,Medium,SemiBold}.woff2` | IBM Plex Sans | 400, 500, 600 | `@ibm/plex-sans` 1.1.0, `fonts/complete/woff2/` |
| `IBMPlexSansKR-{Regular,Medium,SemiBold}.woff2` | IBM Plex Sans KR | 400, 500, 600 | `@ibm/plex-sans-kr` 1.1.0, `fonts/complete/woff2/hinted/` (the only woff2 it ships) |
| `IBMPlexMono-{Regular,Medium}.woff2` | IBM Plex Mono | 400, 500 | `@ibm/plex-mono` 2.5.0, `fonts/complete/woff2/` |

Licence: SIL Open Font License 1.1, Reserved Font Name "Plex" (`plex/IBMPlex-OFL.txt`, the `LICENSE.txt` the
three packages ship, byte-identical; `@ibm/plex-math` 1.1.0 ships the same file, byte-identical too). Font versions: Plex Sans 3.005, Plex Sans KR 1.003 (all 11,172 modern
Hangul syllables, so unbounded Korean stays in the face), Plex Mono 2.005. To refresh:
`npm pack @ibm/plex-sans @ibm/plex-sans-kr @ibm/plex-mono`, copy the same files here, and never rename or
subset them in place (a cut file is a Modified Version under the OFL and may not be called "Plex").

### The Library's math face (`plex/IBMPlexMath-Regular.woff2`, P63-fk.S9)

| File | Face | Source | Role |
|---|---|---|---|
| `IBMPlexMath-Regular.woff2` (401,540 bytes; SHA-256 `5fc8851c…99ea8a8c`) | IBM Plex Math 1.000, regular (OFL 1.1, Reserved Font Name "Plex"; 4,382 mapped characters and the `MATH` table) | `@ibm/plex-math` 1.1.0 (IBM's own package from the `ibm/plex` repository, published 2024-11-11; read 2026-11-17), `fonts/complete/woff2/IBMPlexMath-Regular.woff2`, **unmodified** | `--font-math` in the Library's reader: every formula of the body (job 03, Library round 02: frame.md F99, Q9) |

Not wired through `next/font`: `src/app/reader-fonts.css` declares one `@font-face` with `local("IBM Plex Math")`
first, then the file, beside the reader's other faces, so a page fetches it only when it shows math. The licence is
`plex/IBMPlex-OFL.txt` (above). STIX Two Math stays the next face in the stack and the old reader's own. To
refresh: `npm pack @ibm/plex-math`, copy that one `woff2` here, check it still carries `MATH`, and never subset or
rename it in place.
