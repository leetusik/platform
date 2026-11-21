"use client";

import { useEffect, useRef } from "react";

/**
 * Paper is always light (the print sheet's rule, `app/kb-print.css`: "a dark page on paper is a flooded sheet of
 * toner"). The old body met it through its root's print palette; the Library's body takes the system's colour
 * roles, so for the print it is set to the light scheme (`data-scheme="light"`, which `tokens.css` answers on any
 * element inside a `.ui` root) and set back after. Renders an empty, hidden marker inside the article.
 */
export function PaperLight() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    let was: string | null = null;
    const before = () => {
      was = host.getAttribute("data-scheme");
      host.setAttribute("data-scheme", "light");
    };
    const after = () => {
      if (was === null) host.removeAttribute("data-scheme");
      else host.setAttribute("data-scheme", was);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return <span ref={ref} hidden />;
}
