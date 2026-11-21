"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * The email typed on `/login` or `/signup`, carried to the other screen (job 01 *Sign
 * in*: "The email typed goes with the person to the other screen ... Keep the address
 * out of the URL"). It lives in the `(auth)` layout's memory, which a client move
 * between the two screens keeps: never in the address, never stored, so a reload
 * starts empty. The password and any error stay with their form.
 *
 * It also carries a waitlisted answer to the connect page (job 09): a sign-up or sign-in
 * sent from `/connect?code=…` that answers "waitlisted" goes back there, and the page shows
 * its waitlisted state for that `next` with the email used. Same memory, same rule: never in
 * the address, never stored; a reload shows the page as the server answers it.
 */
export interface Waitlisted {
  email: string;
  /** The laundered `next` the form was sent with (a connect page's address). */
  next: string;
}

interface AuthEmail {
  email: string;
  setEmail: (email: string) => void;
  waitlisted: Waitlisted | null;
  setWaitlisted: (value: Waitlisted | null) => void;
}

const AuthEmailContext = createContext<AuthEmail | null>(null);

export function AuthEmailProvider({
  initialEmail = "",
  initialWaitlisted = null,
  children,
}: {
  initialEmail?: string;
  initialWaitlisted?: Waitlisted | null;
  children: ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [waitlisted, setWaitlisted] = useState<Waitlisted | null>(initialWaitlisted);
  return (
    <AuthEmailContext.Provider
      value={{ email, setEmail, waitlisted, setWaitlisted }}
    >
      {children}
    </AuthEmailContext.Provider>
  );
}

/** The carried email; outside the provider, a form-local one (same behaviour, nothing carried). */
export function useAuthEmail(): AuthEmail {
  const carried = useContext(AuthEmailContext);
  const [email, setEmail] = useState("");
  const [waitlisted, setWaitlisted] = useState<Waitlisted | null>(null);
  return carried ?? { email, setEmail, waitlisted, setWaitlisted };
}
