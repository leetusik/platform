// ── hi2vi sign-in (job 01 *Sign in*, round 03-instrument; P58) ──────────────────
// The two screens' words, verbatim from the signed boards (`SignInForm.dc.html`,
// frame.md F4), read by `src/app/(auth)/` through this file's own path.

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
