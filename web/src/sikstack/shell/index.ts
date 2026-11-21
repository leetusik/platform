// The sikstack Shell (P58: job 01 round 03-instrument's Shell, the org rail per job 03 round 02, F320).
// Client-safe exports only: the server `AppShell` (it reads the session and the request) is
// `@/components/app-shell`, and its data reads are `./data` (server-only), imported by path.
//
// - `publishToast(message)`: show the app's one toast (4 s; a new one replaces the old; F4, F29).
// - `clearToast()`: take it down now.
// - `ToastRegion`: the region the Shell mounts as the last child of `main.app-main`.
// - `LegacyPage`: an old page's boundary inside the Shell (an `(app)` route folder's `layout.tsx`).
// - `ShellOrgNameProvider`, `useShellOrgName()`: the active org's name for the main column (the states).
export { clearToast, publishToast, ToastRegion } from "./toast";
export { TOAST_MS } from "./toast-store";
export { LegacyPage } from "./legacy-page";
export { ShellOrgNameProvider, useShellOrgName } from "./org-name";
export { Shell, type ShellProps } from "./shell";
export type { ShellOrg, ShellProject } from "./model";
