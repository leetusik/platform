"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * The email typed on `/login` or `/signup`, carried to the other screen (job 01 *Sign
 * in*: "The email typed goes with the person to the other screen ... Keep the address
 * out of the URL"). It lives in the `(auth)` layout's memory, which a client move
 * between the two screens keeps: never in the address, never stored, so a reload
 * starts empty. The password and any error stay with their form.
 */
interface AuthEmail {
  email: string;
  setEmail: (email: string) => void;
}

const AuthEmailContext = createContext<AuthEmail | null>(null);

export function AuthEmailProvider({
  initialEmail = "",
  children,
}: {
  initialEmail?: string;
  children: ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail);
  return (
    <AuthEmailContext.Provider value={{ email, setEmail }}>
      {children}
    </AuthEmailContext.Provider>
  );
}

/** The carried email; outside the provider, a form-local one (same behaviour, nothing carried). */
export function useAuthEmail(): AuthEmail {
  const carried = useContext(AuthEmailContext);
  const [email, setEmail] = useState("");
  return carried ?? { email, setEmail };
}
