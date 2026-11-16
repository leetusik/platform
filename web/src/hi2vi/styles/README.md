# The hi2vi design system's sheets

The product's own copy of the signed system (`design-system/hi2vi/project/` in the workspace that drew it):
`tokens.css`, and `bundle.css` with sections 1 to 6 of the signed bundle plus the Done status. Values and
class names are the signed ones; the only changes are the isolation below, listed at the top of each file.

| File | Holds |
| --- | --- |
| `tokens.css` | The colour roles (light, and dark under `data-scheme="dark"`), spacing, radii, type steps, line heights, the two font stacks, the `.type-*` classes. |
| `bundle.css` | Layout tokens, base, primitives, app layout, shell, components, `.status-done`; then `@keyframes skel`. |
| `boundary.css` | The old-page boundary: the copies on `:root` and the restore at `[data-ui-legacy]`. |
| `index.css` | The three, in that order. The root layout imports it after `globals.css`. |

## How it stays out of the old pages

The app also runs Tailwind v4 (its layers `theme, base, components, utilities`) and the old `kb-*` sheets,
and the new shell wraps old pages. So:

1. **Scope.** `tokens.css` and `bundle.css` are each one `@scope (.ui) to ([data-ui-legacy]) { … }` block.
   A rule matches only inside a `.ui` root and never at or under an element with `data-ui-legacy`. A page
   without a `.ui` root matches none of them.
2. **Root rules read `:scope`.** Inside `@scope`, a bare selector matches the root's descendants only
   (`.page` on the root itself would not match), so the signed `:root` and `.ui` rules read `:scope`, which
   keeps the specificity of `.ui`. The root is therefore a bare wrapper: put `.page`, `.app` and every other
   system class on its descendants (`UiRoot > .page > .app > .app-frame …`).
3. **Unlayered.** The sheets sit in no cascade layer, so inside `.ui` they outrank all of Tailwind's layers
   (preflight included) whatever the specificity: a `.grid` or `.gap-5` there is the system's, never
   Tailwind's utility of the same name. Outside `.ui` they match nothing, so Tailwind's still apply.
4. **The boundary.** Custom properties and inherited properties cross a scope boundary. `boundary.css`
   copies every custom property the system declares, as `:root` has it, into `--hi2vi-legacy-*` (new names
   nothing else reads), and at `.ui [data-ui-legacy]` sets each back and resets what the `.ui` root makes
   old content inherit (colour, font, numerals, word breaks, colour scheme) to what `<body>` gives it.
   `tests/hi2vi-styles.test.ts` holds that list equal to the system's.
5. **Not through Tailwind.** Tailwind emits a theme variable on `:root` whenever its input names it, even
   in a comment. The sheets are imported by the root layout, not by `globals.css`, so the system's
   `var(--radius-xs)` never makes Tailwind emit its own `--radius-xs`. For the same reason `globals.css`
   says `@source not "../hi2vi"`, and no comment in it names a theme variable the system reads.

## Using it

- A page opts in by rendering inside `UiRoot` (`src/hi2vi/ui/`): one root a page, outermost, never nested
  (a nested root starts light again). It sets `data-scheme` before the first paint; `scheme="light"` pins
  light (the sign-in screens). A route under a nonce CSP passes `nonce`.
- Old content inside a `.ui` root goes inside `Legacy` (`<div data-ui-legacy>`): no system rule reaches it
  and it inherits as a child of `<body>` does.
- New markup inside `.ui` uses the system's classes only; no Tailwind utility is needed there.
- A later sheet of system classes (a job's frame components) is scoped the same way:
  `@scope (.ui) to ([data-ui-legacy]) { … }`, with root rules as `:scope`, and loaded outside Tailwind.

## Browsers

`@scope`: Chrome 118, Safari 17.4 to 18.6 and from 26.4, Firefox 146 (MDN browser-compat-data 8.1.9,
2026-11-12). Safari 26.0 to 26.3 did not apply `@scope` rules to `input` and `textarea`. A browser without
`@scope` drops both blocks: `.ui` pages go unstyled and the old pages are untouched. `::backdrop` inherits
the dialog's custom properties from Chrome 122, Safari 17.4 and Firefox 120.

## Known differences from the canvas

- `body { background: var(--bg) }` is not built: the tokens live on the `.ui` root, so `<body>` (and an
  overscroll past the page) keeps the app's own ground. `.page` paints the system's.
- Tailwind's preflight sits under the system: where the system sets nothing, an element inside `.ui` takes
  preflight's reset rather than the browser default the canvas had (an `h4` inherits its size and weight;
  `code` takes the old mono stack).
