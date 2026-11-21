/**
 * The active org's name for the error's "Back to <org name>": the Shell's own, given through its
 * context (`@/sikstack/shell`'s `ShellOrgNameProvider`, which `AppShell` puts around the main column), so
 * a server-rendered error names the org in its first HTML. Outside the Shell it is `—`.
 */
export { useShellOrgName } from "@/sikstack/shell/org-name";
