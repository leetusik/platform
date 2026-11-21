"use client";

import { useEffect, useRef } from "react";

import { TAP_IGNORE } from "@/lib/reader/chrome";
import { fitRadicals } from "@/lib/reader/radicals";

import {
  termClose,
  termPress,
  termRest,
  type TermOpen,
  type TermStep,
} from "./term-model";

/**
 * The terms' controller in the Library's reader (P63-fk.S10; job 03, Library round 02, `## Build` § Page: blocks
 * *A term's behaviour*; the old look's is `components/reader/term-layer.tsx`, whose page events this keeps). One
 * client layer for the chapter, mounted beside the body (`ChapterBody`). It drives the server's markup
 * (`./terms.tsx`): the markers `a.blocks-term[data-term]`, one hidden window `tw-<id>` a linked term in the holder
 * `[data-term-holder]`, and the glossary entries' hidden way back. Every decision is `./term-model.ts`'s.
 *
 * - **The two forms.** From 40em of the reader (`@container app`) the holder is `.blocks-term-float`: at most 28em
 *   wide, under the term's last line on the term's left edge, kept inside the column, above the term when there is
 *   no room below; it never covers the term. Under 40em it is `.blocks-term-sheet`: fixed to the bottom, no scrim,
 *   at most 60% of the window's height (`.is-more`: 85% with the longer definition), and the page gets a spacer as
 *   tall as it and scrolls the term's last line above it.
 * - **In the glossary** closes the window, marks the entry (`.is-arrived`), scrolls it under the bar, focuses it
 *   and shows its **Back to the text**, which scrolls the very occurrence to the centre, focuses it and clears the
 *   mark. Without script every marker and **In the glossary** is a link to the entry.
 */

const HOVER_REST_MS = 250;
const HOVER_LEAVE_MS = 200;
/** Where a pointer's click may take focus itself: the sheet then leaves the focus to it. */
const FOCUSABLE =
  "a[href], button, input, select, textarea, summary, label, [tabindex]";

interface Shown {
  win: HTMLElement;
  /** Shown as the sheet (the reader under 40em). */
  sheet: boolean;
}

export function LibraryTermLayer({ chapter }: { chapter: string }) {
  const padRef = useRef<HTMLDivElement>(null);

  // `chapter` (document, version, language) re-binds the layer when the reader moves on and it stays mounted.
  useEffect(() => {
    const art = document.querySelector<HTMLElement>("[data-reader-article]");
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-reader-prose] > [data-reader-body]",
      ),
    );
    const pad = padRef.current;
    if (!art || !pad || !roots.some((r) => r.querySelector("a[data-term]")))
      return;

    const inChapter = (el: Element) => roots.some((r) => r.contains(el));
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const px = (el: Element, name: string, fallback: number) => {
      const n = parseFloat(getComputedStyle(el).getPropertyValue(name));
      return Number.isFinite(n) ? n : fallback;
    };
    /** Under 40em of the reader (`@container app`, the app's content box in its own ems): the sheet. */
    const narrow = () => {
      const app = art.closest<HTMLElement>(".app") ?? art;
      const cs = getComputedStyle(app);
      const width =
        app.clientWidth -
        (parseFloat(cs.paddingLeft) || 0) -
        (parseFloat(cs.paddingRight) || 0);
      return width < 40 * (parseFloat(cs.fontSize) || 16);
    };
    /** The reading area a window must fit in: under the bar (or its line), above the foot bar. */
    const visible = () => {
      const shown = (el: Element | null): el is Element =>
        !!el && getComputedStyle(el).visibility !== "hidden";
      const bar = document.querySelector(".reader .bar");
      const line = document.querySelector(".reader .bar-line");
      const foot = document.querySelector(".reader .foot-bar");
      return {
        top: shown(bar)
          ? bar.getBoundingClientRect().bottom
          : (line?.getBoundingClientRect().bottom ?? 0),
        bottom: shown(foot)
          ? foot.getBoundingClientRect().top
          : window.innerHeight,
      };
    };
    const lines = (el: Element) =>
      Array.from(el.getClientRects()).filter((r) => r.width || r.height);
    const idOf = (term: Element) =>
      (term.getAttribute("aria-controls") ?? "").replace(/^tw-/, "");
    const winOf = (term: Element) => {
      const win = document.getElementById(`tw-${idOf(term)}`);
      return win && inChapter(win) ? win : null;
    };
    const controls = (win: HTMLElement) =>
      Array.from(win.querySelectorAll<HTMLElement>("button, a[href]")).filter(
        (el) => el.getClientRects().length > 0,
      );
    /** A scroll of the reader's own is not a gesture: the chrome stays as it is. */
    const quiet = () => window.dispatchEvent(new Event("reader:quiet"));

    let open: TermOpen<HTMLElement> | null = null;
    let shown: Shown | null = null;
    let timer = 0;
    /** The click that ends the pointer press which closed a window. */
    let swallow = false;
    /** The sheet closed by a press outside: its term takes the focus back, unless the press takes it. */
    let refocus: HTMLElement | null = null;
    /** The pointer went down on a term: its focus and its click swap the window. */
    let downOnTerm = false;
    /** The glossary entry a window's In the glossary led to. */
    let arrived: HTMLElement | null = null;

    const setLong = (win: HTMLElement, on: boolean) => {
      const long = win.querySelector<HTMLElement>(".blocks-term-long");
      const btn = win.querySelector<HTMLElement>("[data-term-more]");
      if (!long || !btn) return;
      long.hidden = !on;
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      btn.dataset.swap = on ? "true" : "false";
      const holder = win.parentElement as HTMLElement;
      holder.classList.toggle(
        "is-more",
        on && holder.matches(".blocks-term-sheet"),
      );
    };

    // Under the term's last line, on the term's left edge, kept inside the column; above the term when the reading
    // area has less room below than the window needs and more above. Never over the term.
    const placeWindow = (term: HTMLElement, win: HTMLElement) => {
      const holder = win.parentElement as HTMLElement;
      const rs = lines(term);
      if (!rs.length) return;
      const first = rs[0];
      const last = rs[rs.length - 1];
      const a = art.getBoundingClientRect();
      const col = (
        term.closest("[data-reader-prose]") ??
        term.closest("[data-reader-body]") ??
        art
      ).getBoundingClientRect();
      const w = holder.offsetWidth;
      const h = win.offsetHeight;
      const colL = col.left - a.left;
      const colR = col.right - a.left;
      let left = first.left - a.left;
      if (left + w > colR) left = colR - w;
      if (left < colL) left = colL;
      const g = px(art, "--space-1", 4);
      const vis = visible();
      const below = vis.bottom - last.bottom;
      const above = first.top - vis.top;
      holder.style.left = `${Math.round(left)}px`;
      if (below >= h + g || below >= above) {
        holder.style.top = `${Math.round(last.bottom - a.top + g)}px`;
        holder.style.bottom = "";
      } else {
        holder.style.top = "";
        holder.style.bottom = `${Math.round(a.bottom - first.top + g)}px`;
      }
    };

    // The sheet: the page gets a spacer as tall as it, and the term's last line scrolls to 1rem above its top edge.
    const fitSheet = (term: HTMLElement, win: HTMLElement, scroll: boolean) => {
      const holder = win.parentElement as HTMLElement;
      const h = Math.ceil(holder.getBoundingClientRect().height);
      if (Math.abs((parseFloat(pad.style.height) || 0) - h) > 1)
        pad.style.height = `${h}px`;
      if (!scroll) return;
      const rs = lines(term);
      const last = rs[rs.length - 1];
      if (!last) return;
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const delta = last.bottom - (holder.getBoundingClientRect().top - rem);
      if (delta >= 1) {
        quiet();
        window.scrollBy(0, delta);
      }
    };

    const layout = (term: HTMLElement, s: Shown, scroll: boolean) => {
      const holder = s.win.parentElement as HTMLElement;
      s.sheet = narrow();
      const long =
        s.win
          .querySelector("[data-term-more]")
          ?.getAttribute("aria-expanded") === "true";
      holder.className = s.sheet
        ? `blocks-term-sheet${long ? " is-more" : ""}`
        : "blocks-term-float";
      s.win.classList.toggle("is-sheet", s.sheet);
      if (s.sheet) {
        holder.style.left = holder.style.top = holder.style.bottom = "";
        fitSheet(term, s.win, scroll);
      } else {
        pad.style.height = "";
        placeWindow(term, s.win);
      }
      holder.dataset.placed = "1";
    };

    const hideWin = (term: HTMLElement, keepPad: boolean) => {
      const win = winOf(term);
      term.setAttribute("aria-expanded", "false");
      if (!win) return;
      win.hidden = true;
      setLong(win, false);
      (win.parentElement as HTMLElement).dataset.placed = "0";
      if (!keepPad) pad.style.height = "";
    };

    const showWin = (term: HTMLElement) => {
      const win = winOf(term);
      if (!win) return null;
      const holder = win.parentElement as HTMLElement;
      holder.dataset.placed = "0";
      setLong(win, false);
      win.hidden = false;
      term.setAttribute("aria-expanded", "true");
      const s: Shown = { win, sheet: false };
      fitRadicals(win);
      layout(term, s, true);
      return s;
    };

    /** Apply a step of the model to the page: close, open, then the focus. */
    const apply = (step: TermStep<HTMLElement>) => {
      window.clearTimeout(timer);
      if (step.focus === "term" && step.hide)
        // The focus first: the window holds it until it hides.
        step.hide.focus({ preventScroll: true });
      if (step.hide) hideWin(step.hide, !!step.show);
      if (step.hide) shown = null;
      open = step.open;
      if (step.show) {
        shown = showWin(step.show);
        if (!shown) {
          open = null;
          step.show.setAttribute("aria-expanded", "false");
          return;
        }
      }
      const s = shown;
      if (s && open && (step.focus === "window" || (step.show && s.sheet)))
        s.win.focus({ preventScroll: true });
    };

    const close = (how: Parameters<typeof termClose>[1]) =>
      termClose(open, how, shown?.sheet ?? false);

    const toggleLong = () => {
      const s = shown;
      if (!s || !open) return;
      const on =
        s.win
          .querySelector("[data-term-more]")
          ?.getAttribute("aria-expanded") !== "true";
      setLong(s.win, on);
      fitRadicals(s.win);
      if (s.sheet) fitSheet(open.term, s.win, true);
    };

    const unmark = () => {
      const entry = arrived;
      arrived = null;
      if (!entry) return;
      entry.classList.remove("is-arrived");
      const back = entry.querySelector<HTMLElement>("[data-term-back]");
      if (back) {
        back.hidden = true;
        delete back.dataset.to;
      }
    };

    const toGlossary = () => {
      const o = open;
      if (!o) return;
      const term = o.term;
      const entry = document.getElementById(`gl-${idOf(term)}`);
      apply(close("away"));
      if (!entry || !inChapter(entry)) return;
      unmark();
      entry.classList.add("is-arrived");
      const back = entry.querySelector<HTMLElement>("[data-term-back]");
      if (back && term.id) {
        back.dataset.to = term.id;
        back.hidden = false;
      }
      arrived = entry;
      quiet();
      entry.scrollIntoView({ block: "start", behavior: "instant" });
      entry.focus({ preventScroll: true });
    };

    const goBack = (back: HTMLElement) => {
      const id = back.dataset.to ?? "";
      const term = id ? document.getElementById(id) : null;
      unmark();
      if (!term) return;
      quiet();
      term.scrollIntoView({ block: "center", behavior: "instant" });
      term.focus({ preventScroll: true });
    };

    // ---- the page's events -----------------------------------------------------------------------------------------
    const onDown = (e: PointerEvent) => {
      swallow = false;
      refocus = null;
      const t = e.target as Element | null;
      downOnTerm = !!t?.closest?.("a[data-term]");
      const o = open;
      const s = shown;
      if (!o || !s || !t?.closest || downOnTerm || s.win.contains(t)) return;
      const step = close("outside");
      apply({ ...step, focus: null });
      swallow = true;
      if (step.focus === "term") refocus = o.term;
    };

    const onArtClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (swallow) {
        swallow = false;
        // The click that closed a window does not also toggle the chrome (the frame's tap).
        if (!t.closest(TAP_IGNORE)) e.stopPropagation();
      }
      if (refocus) {
        const back = refocus;
        refocus = null;
        if (!t.closest(FOCUSABLE)) back.focus({ preventScroll: true });
      }
      const plain =
        e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      const term = t.closest<HTMLElement>("a[data-term]");
      if (term && inChapter(term)) {
        downOnTerm = false;
        // A modified click is the browser's (a new tab lands on the entry).
        if (!plain) return;
        e.preventDefault();
        // A press on a link keeps the reader's selection, which the annotation layer would read again: the tap on a
        // term dismisses it, as a tap anywhere else does.
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) sel.removeAllRanges();
        apply(termPress(open, term));
        return;
      }
      const s = shown;
      if (s && s.win.contains(t)) {
        if (t.closest("[data-term-close]")) {
          e.preventDefault();
          apply(close("close"));
        } else if (t.closest("[data-term-more]")) {
          e.preventDefault();
          toggleLong();
        } else if (plain && t.closest("a[data-term-go]")) {
          e.preventDefault();
          toGlossary();
        }
        return;
      }
      const back = t.closest<HTMLElement>("[data-term-back]");
      if (back && inChapter(back)) {
        e.preventDefault();
        goBack(back);
      }
    };

    // A press outside the article (the bar's empty stretch) gives the sheet's term its focus back.
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!refocus || !t?.closest || art.contains(t)) return;
      const back = refocus;
      refocus = null;
      if (!t.closest(FOCUSABLE)) back.focus({ preventScroll: true });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const o = open;
      const s = shown;
      if (e.key === "Escape" && o) {
        e.preventDefault();
        apply(close("escape"));
        return;
      }
      if (
        (e.key === " " || e.key === "Spacebar") &&
        t?.matches?.("a[data-term]") &&
        inChapter(t)
      ) {
        e.preventDefault();
        // Space on the open term moves the focus into its window; on any other term it is the term's click.
        if (o && o.term === t) {
          open = { term: t, mode: "focus" };
          s?.win.focus({ preventScroll: true });
        } else t.click();
        return;
      }
      if (e.key === "Tab" && o && s && t && s.win.contains(t)) {
        const list = controls(s.win);
        const at = document.activeElement;
        if (!e.shiftKey && list.length && at === list[list.length - 1]) {
          // Past the last control the window closes and the focus carries on in the text, from the term.
          o.term.focus({ preventScroll: true });
          apply(close("away"));
        } else if (e.shiftKey && (at === list[0] || at === s.win)) {
          e.preventDefault();
          apply(close("close"));
        }
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const o = open;
      const s = shown;
      const t = e.target as Element | null;
      if (!o || !s || !t) return;
      if (s.win.contains(t) || t === o.term) return;
      if (downOnTerm && t.closest?.("a[data-term]")) return;
      apply(close("away"));
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches) return;
      const t = e.target as Element | null;
      if (!t?.closest) return;
      const from = e.relatedTarget as Node | null;
      const term = t.closest<HTMLElement>("a[data-term]");
      if (term && inChapter(term)) {
        if (from && term.contains(from)) return;
        window.clearTimeout(timer);
        const step = termRest(open, term, narrow());
        if (!step.show) return;
        timer = window.setTimeout(
          () => apply(termRest(open, term, narrow())),
          HOVER_REST_MS,
        );
        return;
      }
      const s = shown;
      if (s && s.win.contains(t) && !(from && s.win.contains(from)))
        window.clearTimeout(timer);
    };

    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const t = e.target as Element | null;
      if (!t?.closest) return;
      const to = e.relatedTarget as Node | null;
      const term = t.closest<HTMLElement>("a[data-term]");
      const o = open;
      const s = shown;
      const leave = () => {
        window.clearTimeout(timer);
        if (close("leave").hide)
          timer = window.setTimeout(
            () => apply(close("leave")),
            HOVER_LEAVE_MS,
          );
      };
      if (term && inChapter(term)) {
        if (to && term.contains(to)) return;
        window.clearTimeout(timer);
        if (o && o.term === term) leave();
        return;
      }
      if (o && s && s.win.contains(t) && !(to && s.win.contains(to))) leave();
    };

    // Re-placed on resize; a change of form (a phone turned) places it in the new one.
    const relayout = () => {
      const o = open;
      const s = shown;
      if (!o || !s) return;
      layout(o.term, s, s.sheet !== narrow());
    };
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(relayout)
        : null;
    ro?.observe(art);

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("click", onDocClick, true);
    art.addEventListener("click", onArtClick, true);
    art.addEventListener("pointerover", onOver);
    art.addEventListener("pointerout", onOut);
    window.addEventListener("resize", relayout);
    return () => {
      if (open) apply(close("away"));
      unmark();
      window.clearTimeout(timer);
      ro?.disconnect();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("click", onDocClick, true);
      art.removeEventListener("click", onArtClick, true);
      art.removeEventListener("pointerover", onOver);
      art.removeEventListener("pointerout", onOut);
      window.removeEventListener("resize", relayout);
    };
  }, [chapter]);

  // The page's spacer under the sheet: zero until a sheet opens.
  return <div ref={padRef} data-term-pad="" aria-hidden="true" />;
}
