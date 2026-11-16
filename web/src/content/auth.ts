// Auth-surface copy (P12.S2) — the public login + signup pages, skinned as
// hi2vi_web's dark "secure threshold" gate. Copy-as-data per the S1 convention:
// pages never hardcode strings inline.
//
// The error copy is keyed by the BFF's STATUS CODE, never by knowledge's `detail`
// text (which the BFF deliberately does not forward). Note `invalidCredentials` is
// intentionally one message for both an unknown email and a wrong password —
// knowledge answers an identical generic 401 for both so accounts cannot be
// enumerated, and this copy preserves that property in the UI.

export interface AuthPageCopy {
  /** Document <title> (the SITE template appends " · knowledge"). */
  title: string;
  lead: string;
  sub: string;
  /** Mono uppercase pill by the brand row on the dark gate, e.g. "Secure". */
  securePill: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  /** Hint shown under the password field (signup states the 8-char minimum). */
  passwordHint?: string;
  submitLabel: string;
  submitPendingLabel: string;
  /** Cross-link to the other auth page, e.g. "No account yet? Create one". */
  altPrompt: string;
  altLinkLabel: string;
  altHref: string;
}

/** Status-keyed error copy shared by both forms. */
export const AUTH_ERRORS = {
  /** 401 — unknown email OR wrong password, deliberately indistinguishable. */
  invalidCredentials: "Incorrect email or password.",
  /** 409 — signup against an email that already exists. */
  emailTaken: "An account with this email already exists. Sign in instead.",
  /** 400 / 422 — backend or shape validation. */
  invalidInput:
    "Enter a valid email address and a password of at least 8 characters.",
  /** 429 — the per-IP throttle. */
  rateLimited: "Too many attempts. Please wait a few minutes and try again.",
  /** 5xx / network. */
  generic: "Something went wrong. Please try again.",
} as const;

/** The mono trust-chip footer under the gate card (design: "Signed session · …"). */
export const AUTH_TRUST_ITEMS = [
  "Signed session",
  "SameSite=Strict",
  "Noindex",
] as const;

export const LOGIN_PAGE: AuthPageCopy = {
  title: "Sign in",
  lead: "Sign in",
  sub: "Access your org, projects, documents, and usage.",
  securePill: "Secure",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  passwordLabel: "Password",
  passwordPlaceholder: "Your password",
  submitLabel: "Sign in",
  submitPendingLabel: "Signing in…",
  altPrompt: "No account yet?",
  altLinkLabel: "Create one",
  altHref: "/signup",
};

export const SIGNUP_PAGE: AuthPageCopy = {
  title: "Create account",
  lead: "Create your account",
  sub: "A default org and project are created for you automatically.",
  securePill: "Secure",
  emailLabel: "Email",
  emailPlaceholder: "you@example.com",
  passwordLabel: "Password",
  passwordPlaceholder: "At least 8 characters",
  passwordHint: "Use at least 8 characters.",
  submitLabel: "Create account",
  submitPendingLabel: "Creating account…",
  altPrompt: "Already have an account?",
  altLinkLabel: "Sign in",
  altHref: "/login",
};

// ── hi2vi sign-in (job 01 *Sign in*, round 03-instrument; P58) ──────────────────
// The two screens' words, verbatim from the signed boards (`SignInForm.dc.html`,
// frame.md F4), read by `src/app/(auth)/` through this file's own path. The exports
// above stay only because `content/index.ts` re-exports them; no screen reads them now.

/** One screen's words: `sign-in` is `/login`, `sign-up` is `/signup`. */
export interface SignInScreenCopy {
  /** The `h1` and the document title. */
  title: string;
  submit: string;
  submitSending: string;
  /** The line under the panel: the question, then the link to the other screen. */
  altPrompt: string;
  altLink: string;
  altHref: string;
  /** Anything else, or no answer. */
  failed: string;
}

export const SIGN_IN_COPY = {
  wordmark: "hi2vi",
  wordmarkLabel: "hi2vi, home",
  email: "Email",
  password: "Password",
  passwordHint: "Use at least 8 characters.",
  errors: {
    /** 401, sign-in. */
    wrong: "Incorrect email or password.",
    /** 400 or 422. */
    invalid:
      "Enter a valid email address and a password of at least 8 characters.",
    /** 429. */
    limited: "Too many attempts. Wait a few minutes and try again.",
    /** 409, sign-up: the field error under Email ("Sign in" kept on one line). */
    taken: "An account with this email already exists. Sign in instead.",
  },
  screens: {
    "sign-in": {
      title: "Sign in",
      submit: "Sign in",
      submitSending: "Signing in…",
      altPrompt: "No account yet?",
      altLink: "Create account",
      altHref: "/signup",
      failed: "Could not sign in. Try again.",
    },
    "sign-up": {
      title: "Create account",
      submit: "Create account",
      submitSending: "Creating account…",
      altPrompt: "Already have an account?",
      altLink: "Sign in",
      altHref: "/login",
      failed: "Could not create your account. Try again.",
    },
  } satisfies Record<"sign-in" | "sign-up", SignInScreenCopy>,
} as const;

/**
 * The waitlist state (operator D2: no design round; signed components only). Shown in
 * place of the form after a waitlisted Create account or Sign in; the only new words on
 * these screens. `text` takes the email the person used.
 */
export const WAITLIST_COPY = {
  "sign-up": {
    title: "Account created",
    text: (email: string) =>
      `hi2vi is still being built, so your account is on the waitlist. We will email ${email} when it opens.`,
  },
  "sign-in": {
    title: "Still on the waitlist",
    text: (email: string) =>
      `Your account is still on the waitlist. We will email ${email} when hi2vi opens.`,
  },
  back: "Back to sign in",
} as const;
