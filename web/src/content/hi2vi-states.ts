// The app's shared page states under the Shell: Error and Not found (job 01 round 03-instrument,
// `## Build` § Shared states; `States.dc.html`). Every word is the board's, verbatim. Imported by its
// own path, never through `content/index.ts`.

export const HI2VI_STATES = {
  /** Where "Back to <org name>" goes: the org's home. */
  orgHomeHref: "/dashboard",
  back: (orgName: string) => `Back to ${orgName}`,
  error: {
    title: "This page did not load",
    text: "Something failed on our side. Try again. If it keeps failing, send us the reference.",
    retry: "Try again",
    reference: (digest: string) => `Reference ${digest}`,
  },
  notFound: {
    title: "Page not found",
    text: (orgName: string) =>
      `This page doesn’t exist, or it isn’t part of ${orgName}.`,
  },
} as const;
