// The words of an org's public library (job 03, Library round 02, `PublicLibrary.dc.html`,
// `PublicLibraryHead.dc.html`; `## Build` § Page: public-library; frame.md F71). Verbatim from the signed
// boards. The shelves' own words (a section's count, its foot link, a row's facts) are
// `@/content/library-page`'s; Error's are `@/content/sikstack-states`'. Imported by its own path, never
// through `content/index.ts`.

export const PUBLIC_LIBRARY = {
  /** A member's way back, on its own line above the head. */
  back: "Library",
  /** The head's first fact, at weight 500, before the count. */
  facts: "Public library",
  loading: "Loading…",
  note: {
    /** A visitor: `Nothing you read here is saved. <Sign in> to keep your place.` */
    visitor: {
      before: "Nothing you read here is saved. ",
      signIn: "Sign in",
      after: " to keep your place.",
    },
    member: "Your progress here is private to you.",
    /** Nothing public, a member: `Nothing is public yet: open one of <Personal’s projects> and choose Make public.` */
    empty: {
      before: "Nothing is public yet: open one of ",
      projects: (org: string): string => `${org}’s projects`,
      after: " and choose Make public.",
    },
  },
  notFound: {
    title: "Library not found",
    visitor:
      "This link doesn’t point at a public library. It may have moved, been made private, or never existed.",
    member: "This library doesn’t exist, or nothing in it is public.",
    signIn: "Sign in",
  },
  /** Not found's and Error's way out, a member's: the Library. */
  backToLibrary: "Back to Library",
} as const;
