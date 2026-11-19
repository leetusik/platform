"use client";

import { useEffect, useState } from "react";

import { Bar } from "@/hi2vi/library";

import { BOOK_HEAD_ID } from "./book-head";

/**
 * The book page's Bar (`Book.dc.html`, frame.md F52, F53): the way back, named for where it goes; the
 * book's title and one fact (a member's state, a visitor's count) once the head's bottom edge is above the
 * bar's; Sign in for a visitor. No tools, no reading, no progress. Without `title` (a state: loading, not
 * found, error) the bar is complete and shows no title.
 */
export function BookBar({
  back,
  homeHref,
  title,
  meta,
  visitor = false,
  signInHref,
}: {
  back: { href: string; label: string };
  homeHref: string;
  title?: string;
  meta?: string;
  visitor?: boolean;
  signInHref?: string;
}) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!title) return;
    const measure = () => {
      const head = document.getElementById(BOOK_HEAD_ID);
      const bar = head?.closest(".app")?.querySelector(".bar-wrap");
      if (!head || !bar) return;
      setPast(
        head.getBoundingClientRect().bottom <
          bar.getBoundingClientRect().bottom,
      );
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [title]);

  return (
    <Bar
      back={back.label}
      backHref={back.href}
      title={title}
      meta={meta}
      showTitle={!!title && past}
      viewer={visitor ? "visitor" : "member"}
      homeHref={homeHref}
      signInHref={visitor ? signInHref : undefined}
    />
  );
}
