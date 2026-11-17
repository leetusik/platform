"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReviewCardView as OldCardView } from "@/components/review/card";
import { READER_FRAME } from "@/content/reader-frame";
import { REVIEW } from "@/content/review";
import { Display, Sheet } from "@/hi2vi/library";
import { UiRoot } from "@/hi2vi/ui";
import type {
  ReaderSettings,
  TextSize,
  ThemeChoice,
} from "@/lib/reader-cookie";
import { reduce, type QuizAction } from "@/lib/reader/quiz";
import {
  loadReviewContinue,
  loadReviewQueue,
  rateReviewCard,
  saveReviewSettings,
  setReviewCardStatus,
  type ContinueView,
} from "@/lib/review/actions";
import { browserZone, zoneIds, type SettingsDraft } from "@/lib/review/model";
import { freshFor, specFor } from "@/lib/review/spec";
import type { QueueMeta, Rating, ReviewQueue } from "@/lib/review/types";

import { ReviewCardView } from "./card";
import { drawnForm } from "./card-model";
import { DueHead } from "./due-head";
import { ReviewEndBody } from "./end";
import { contView, endView, saveLifts } from "./end-model";
import { Focus, type FocusSheet } from "./focus";
import {
  dueHeadOf,
  focusProgress,
  frameScheme,
  settingsPlan,
  withDisplay,
  type SchedulePhase,
} from "./model";
import { OldView } from "./old-view";
import { keepStep, restored, restoreKey } from "./saved-line";
import { dropKept, readKept, writeKept } from "./saved-store";
import { Schedule } from "./schedule";
import {
  canSuspend,
  rateLanded,
  rateStart,
  suspendLanded,
  suspendStart,
  undoLanded,
  undoStart,
  type Desk,
  type Then,
} from "./session";
import { CardSkeleton, ReviewFailed } from "./states";

/**
 * `/review` in Review's focused frame (job 07-listen-review, round 01: `Review.dc.html`; frame.md F201, F215,
 * F218 to F221, F223, F226):
 *
 *   UiRoot > .page > .app.bare.focus[data-scheme][data-size]
 *     > Focus (the bar, its 3 px line: done ÷ (done + due + new), 0 while loading or failed)
 *     + main.app-main.focus-main[aria-busy] > .focus-col (DueHead, then the card, the end, the skeleton or the
 *       failure) + .toast-region (Card suspended with Undo for ten seconds, or the failed suspend's notice)
 *     + the Library's Sheet, from the end side, one at a time: Review settings (`Schedule`) and Display (the
 *       reader's own, one setting with the reader: the `kb_reader` cookie)
 *
 * The card is Review's own (`./card`, P64-3y.S8): a card in a form job 07 does not draw (several right answers,
 * several blanks) keeps today's card, whole, bridged in the flow (`OldView`), as the Library's reader keeps today's
 * quiz for those forms. The end of a session is Review's own (`./end`, P64-3y.S9): it takes the card's place when the
 * queue ends, with the head's held counts; a settings save that lifts the limit that ended it reads the queue again and
 * moves to the first held card, any other save keeps the end (re-read quietly) with `Settings saved`. `/review` after
 * the end shows that end for the rest of the day because the queue read does (the server's `limit_reached` and
 * counts); its saved line comes back too, kept in this browser for the account and the review day (`./saved-line`,
 * read after mount so the server render and the first client render agree). Nothing old is fixed to the window any
 * more.
 *
 * The queue's state, its sends and the settings are `ReviewApp`'s (`components/review/review-app.tsx`), moved
 * here unchanged (the rating, suspend and undo steps into `./session`), and they rate against the server
 * idempotently:
 *  - the page makes a `review_id` per rating of a card, and **Try again sends the same one**, so a rating that did
 *    reach the server is never counted twice (`lib/review/model.ts` `reviewIdFor`); a reply lands only on the
 *    rating that sent it (`pending.seq`);
 *  - the counts are the server's, replaced by every reply; nothing is counted here (suspend moves them by one,
 *    optimistically, until its reply);
 *  - a card due again today goes to the end of the local queue with the reply's previews; a daily limit reached
 *    ends the session; when the local queue runs out and cards are still due the page asks again.
 */
type Panel = FocusSheet | null;

interface AppState extends Desk {
  status: "ready" | "loading" | "failed";
  ref: string | null;
  bybook: boolean;
  panel: Panel;
  draft: SettingsDraft | null;
  phase: SchedulePhase;
  attempt: number;
  settings: ReaderSettings;
  next: ContinueView | null;
}

export type InitialQueue =
  { ok: true; data: ReviewQueue } | { ok: false; ref: string };

const EMPTY_META: QueueMeta = {
  now: "1970-01-01T00:00:00.000Z",
  day: {
    start: "1970-01-01T00:00:00.000Z",
    end: "1970-01-02T00:00:00.000Z",
    time_zone: "UTC",
  },
  profile: {
    time_zone: null,
    day_starts_at_hour: 4,
    max_reviews_per_day: 200,
    new_highlights_per_day: 20,
  },
  counts: { due: 0, new_highlights: 0, done_today: 0, by_book: [] },
  limit_reached: null,
  next_due_at: null,
};

/** How long Card suspended offers Undo (F223, 03-library F65's undo time). */
const UNDO_MS = 10_000;

function metaOf(q: ReviewQueue): QueueMeta {
  return {
    now: q.now,
    day: q.day,
    profile: q.profile,
    counts: q.counts,
    limit_reached: q.limit_reached,
    next_due_at: q.next_due_at,
  };
}

function init(
  initial: InitialQueue,
  settings: ReaderSettings,
  next: ContinueView | null,
): AppState {
  const base = {
    states: {},
    pending: null,
    failed: null,
    saved: null,
    toast: null,
    bybook: false,
    panel: null,
    draft: null,
    phase: "rest" as SchedulePhase,
    attempt: 0,
    settings,
    next,
  };
  return initial.ok
    ? {
        ...base,
        status: "ready",
        ref: null,
        meta: metaOf(initial.data),
        queue: initial.data.cards,
      }
    : {
        ...base,
        status: "failed",
        ref: initial.ref,
        meta: EMPTY_META,
        queue: [],
      };
}

export function ReviewFrame({
  initial,
  settings,
  initialNext,
  account,
}: {
  initial: InitialQueue;
  settings: ReaderSettings;
  initialNext: ContinueView | null;
  /** The signed-in account's id: it keys the end's kept saved line (F241); null keeps nothing. */
  account: string | null;
}) {
  const [s, setS] = useState<AppState>(() =>
    init(initial, settings, initialNext),
  );
  const ref = useRef(s);
  const set = useCallback((fn: (p: AppState) => AppState) => {
    ref.current = fn(ref.current);
    setS(ref.current);
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const want = useRef<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const loadSeq = useRef(0);
  const toastSeq = useRef(0);
  const [os, setOs] = useState<"light" | "dark">("light");
  const nextAsked = useRef(initialNext !== null);
  const zoneTaken = useRef(false);

  // What the device is now, for System's readout.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setOs(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // ---- focus ---------------------------------------------------------------------------
  /** Move focus once the next render has the target (a card, an end state, Next, the answer). */
  const focusAfter = useCallback((sel: string) => {
    want.current = sel;
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    const sel = want.current;
    if (!sel) return;
    const t0 = Date.now();
    let frame = 0;
    const go = () => {
      const el = rootRef.current?.querySelector<HTMLElement>(sel);
      if (
        el &&
        el.offsetParent !== null &&
        !(el as HTMLButtonElement).disabled
      ) {
        want.current = null;
        el.focus({ preventScroll: true });
        // A new card scrolls the page back only if the reader is below the card's head,
        // so the head sits under the top bar.
        if (el.matches("[data-rv-card], [data-rv-end]")) {
          const bar =
            rootRef.current
              ?.querySelector<HTMLElement>(".bar-wrap")
              ?.getBoundingClientRect().height ?? 56;
          const top =
            el.getBoundingClientRect().top + window.scrollY - (bar + 16);
          if (window.scrollY > top)
            window.scrollTo({
              top: Math.max(0, Math.round(top)),
              behavior: "instant",
            });
        }
        return;
      }
      if (Date.now() - t0 < 1500) frame = requestAnimationFrame(go);
    };
    frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [tick]);

  const CARD_OR_END = "[data-rv-card], [data-rv-end]";

  // ---- reading the queue -------------------------------------------------------------------
  const reload = useCallback(
    async (opts: { silent: boolean; focus?: boolean }) => {
      const mine = ++loadSeq.current;
      if (!opts.silent) set((p) => ({ ...p, status: "loading", ref: null }));
      const res = await loadReviewQueue();
      if (mine !== loadSeq.current) return;
      if (!res.ok) {
        if (opts.silent && ref.current.status === "ready") return;
        set((p) => ({ ...p, status: "failed", ref: res.ref }));
        focusAfter("[data-rv-end]");
        return;
      }
      set((p) => ({
        ...p,
        status: "ready",
        ref: null,
        meta: metaOf(res.data),
        queue: res.data.cards,
        pending: p.pending,
      }));
      if (!opts.silent && opts.focus !== false) focusAfter(CARD_OR_END);
    },
    [set, focusAfter],
  );

  // The first review takes the browser's time zone (the hint under Time zone says so).
  useEffect(() => {
    const p = ref.current;
    if (
      zoneTaken.current ||
      p.status !== "ready" ||
      p.meta.profile.time_zone !== null
    )
      return;
    zoneTaken.current = true;
    const tz = browserZone();
    if (!tz) return;
    void saveReviewSettings({ time_zone: tz }).then((res) => {
      if (res.ok) void reload({ silent: true });
    });
  }, [reload]);

  // Back from the reader (a restored page): the queue is read again, the same card first if
  // it is still due. The rating that was not yet sent is not kept.
  useEffect(() => {
    const on = (e: PageTransitionEvent) => {
      if (e.persisted && ref.current.pending === null)
        void reload({ silent: true });
    };
    window.addEventListener("pageshow", on);
    return () => window.removeEventListener("pageshow", on);
  }, [reload]);

  const head = s.queue[0] ?? null;
  const due = dueHeadOf({ status: s.status, meta: s.meta, queue: s.queue });
  const kind = due.kind;

  // The continue-reading block (Q9) is read once, when the first end state shows.
  useEffect(() => {
    if (
      nextAsked.current ||
      kind === null ||
      kind === "card" ||
      kind === "empty"
    )
      return;
    nextAsked.current = true;
    void loadReviewContinue().then((next) => set((p) => ({ ...p, next })));
  }, [kind, set]);

  // The end's saved line for the rest of the review day (F241): the line an end shows is kept in this browser, for
  // this account and review day, and dropped once the session has cards again; `/review` opening on an end with no
  // line yet reads it back. Both run after mount only, so the server render and the first client render agree.
  const day = s.meta.day.start;
  useEffect(() => {
    const step = keepStep({ account, kind, saved: s.saved, day });
    if (step.t === "store") writeKept(step.key, step.value);
    else if (step.t === "drop") dropKept(step.key);
  }, [account, kind, s.saved, day]);
  useEffect(() => {
    const key = restoreKey({ account, kind, saved: ref.current.saved });
    if (key === null) return;
    const out = restored(readKept(key), day);
    if (out.drop) dropKept(key);
    const back = out.line;
    if (back) set((q) => (q.saved === null ? { ...q, saved: back } : q));
  }, [account, kind, day, set]);

  // ---- answering a quiz card ----------------------------------------------------------------
  const act = (a: QuizAction) => {
    const p = ref.current;
    const card = p.queue[0];
    if (!card || p.pending) return;
    const spec = specFor(card);
    if (!spec) return;
    const cur = p.states[card.card_id] ?? freshFor(card);
    const r = reduce(spec, cur, a);
    set((q) => ({ ...q, states: { ...q.states, [card.card_id]: r.st } }));
    // After grading, focus moves to Next; after Show answer, to the answer.
    if (r.graded && a.t !== "self") focusAfter("[data-rv-main]");
    else if (a.t === "reveal") focusAfter("[data-rv-answer]");
  };

  // ---- rating ---------------------------------------------------------------------------------
  /** After a step: read the queue again, or move the focus (the next card or end; Try again after a failure). */
  const after = (then: Then) => {
    if (then === "reload") void reload({ silent: false });
    else if (then === "focus") focusAfter(CARD_OR_END);
    else if (then === "focus-retry") focusAfter("[data-rv-main]");
  };
  const rate = (rating: Rating) => {
    const mine = seq.current + 1;
    const start = rateStart(ref.current, rating, mine);
    if (!start) return;
    seq.current = mine;
    set((q) => ({ ...q, ...start.patch }));
    const sent = {
      card: start.card,
      rating,
      reviewId: start.send.reviewId,
      seq: mine,
    };
    void rateReviewCard(start.send).then((res) => {
      // A reply lands only on the rating that sent it.
      const out = rateLanded(ref.current, sent, res, new Date().toISOString());
      if (!out) return;
      set((q) => ({ ...q, ...out.patch }));
      after(out.then);
    });
  };
  const retry = () => {
    const f = ref.current.failed;
    if (f) rate(f.rating);
  };

  // ---- suspend and undo --------------------------------------------------------------------------
  const runSuspend = (card: Desk["queue"][number]) => {
    const id = ++toastSeq.current;
    set((q) => ({ ...q, ...suspendStart(q, card, id) }));
    focusAfter(CARD_OR_END);
    void setReviewCardStatus({
      cardId: card.card_id,
      status: "suspended",
    }).then((res) => {
      const out = suspendLanded(
        ref.current,
        card,
        res,
        res.ok ? toastSeq.current : ++toastSeq.current,
      );
      if (out.patch) {
        const patch = out.patch;
        set((q) => ({ ...q, ...patch }));
      }
      after(out.then);
    });
  };
  const suspend = () => {
    const card = canSuspend(ref.current);
    if (card) runSuspend(card);
  };
  const undo = () => {
    const start = undoStart(ref.current);
    if (!start) return;
    const { card } = start;
    set((q) => ({ ...q, ...start.patch }));
    focusAfter(CARD_OR_END);
    void setReviewCardStatus({ cardId: card.card_id, status: "active" }).then(
      (res) => {
        const out = undoLanded(
          ref.current,
          card,
          res,
          res.ok ? toastSeq.current : ++toastSeq.current,
        );
        if (out.patch) {
          const patch = out.patch;
          set((q) => ({ ...q, ...patch }));
        }
        after(out.then);
      },
    );
  };
  const toastRetry = () => {
    const card = ref.current.toast?.card;
    if (card) runSuspend(card);
  };

  // Card suspended offers Undo for ten seconds (F223); the failed suspend's notice is no toast and stays.
  const toastId = s.toast?.kind === "undo" ? s.toast.id : null;
  useEffect(() => {
    if (toastId === null) return;
    const timer = window.setTimeout(() => {
      set((q) => (q.toast?.id === toastId ? { ...q, toast: null } : q));
    }, UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [toastId, set]);

  // ---- the sheets -------------------------------------------------------------------------------
  // The Library's Sheet: one at a time, a modal dialog from the end side; Close, Escape and the scrim close it,
  // and the focus returns to what opened it (Settings, Display, or the end's Change your daily limits →).
  const openPanel = (name: Exclude<Panel, null>, from: HTMLElement | null) => {
    const p = ref.current;
    if (p.panel === name) {
      closePanel();
      return;
    }
    if (p.panel === null) opener.current = from;
    set((q) => ({
      ...q,
      panel: name,
      draft:
        name === "settings"
          ? {
              tz: q.meta.profile.time_zone ?? browserZone() ?? "UTC",
              max: String(q.meta.profile.max_reviews_per_day),
              maxNew: String(q.meta.profile.new_highlights_per_day),
            }
          : null,
      phase: "rest",
    }));
  };
  const closePanel = () => {
    set((q) => ({ ...q, panel: null, draft: null, phase: "rest" }));
  };
  const returnFocus = useCallback(() => opener.current, []);

  // ---- review settings ----------------------------------------------------------------------------
  const field = (key: keyof SettingsDraft, value: string) =>
    set((q) =>
      q.draft
        ? {
            ...q,
            draft: { ...q.draft, [key]: value },
            phase: q.phase === "failed" ? "invalid" : q.phase,
          }
        : q,
    );
  const saveSettings = () => {
    const p = ref.current;
    const draft = p.draft;
    if (!draft || p.phase === "saving") return;
    const plan = settingsPlan(draft);
    if (!plan.ok) {
      set((q) => ({ ...q, phase: "invalid", attempt: q.attempt + 1 }));
      return;
    }
    const mine = ++seq.current;
    // Which end the save is made on, and the settings it replaces (F237: a save that lifts that end's limit).
    const onEnd = dueHeadOf({
      status: p.status,
      meta: p.meta,
      queue: p.queue,
    }).kind;
    const before = p.meta;
    set((q) => ({ ...q, phase: "saving" }));
    void saveReviewSettings(plan.input).then((res) => {
      const cur = ref.current;
      if (cur.phase !== "saving" || mine !== seq.current) return;
      if (!res.ok) {
        set((q) => ({ ...q, phase: "failed" }));
        return;
      }
      set((q) => ({
        ...q,
        panel: null,
        draft: null,
        phase: "rest",
        meta: { ...q.meta, profile: res.data },
        saved: {
          word: REVIEW.head.settingsSaved,
          rest: REVIEW.head.settingsSavedRest(
            res.data.max_reviews_per_day,
            res.data.new_highlights_per_day,
          ),
        },
      }));
      // The limits change what is shown today: read the queue again. On an end, a save that lifts its limit brings the
      // held cards back at the first of them (focused); any other save keeps the end where it is, re-read quietly.
      if (onEnd !== null && onEnd !== "card") {
        const lifts = saveLifts(
          endView(onEnd, before).kind,
          before.counts,
          before.profile,
          res.data,
        );
        if (lifts) void reload({ silent: false });
        else void reload({ silent: true });
      } else void reload({ silent: false, focus: false });
    });
  };
  const draftTz = s.draft?.tz ?? null;
  const zones = useMemo(
    () => (draftTz === null ? [] : zoneIds(draftTz)),
    [draftTz],
  );

  // ---- Display: the reader's own setting (F220) ------------------------------------------------------
  const apply = (change: { size?: TextSize; theme?: ThemeChoice }) => {
    const next = withDisplay(
      ref.current.settings,
      change,
      window.location.protocol === "https:",
    );
    set((q) => ({ ...q, settings: next.settings }));
    document.cookie = next.cookie;
  };

  // ---- the view -------------------------------------------------------------------------------------
  const { settings: dev } = s;
  const loading = s.status === "loading";
  const ready = s.status === "ready";
  const spec = head ? specFor(head) : null;
  const st = head && spec ? (s.states[head.card_id] ?? freshFor(head)) : null;
  const form = head ? drawnForm(head, spec) : null;
  const sending =
    s.pending && head && s.pending.cardId === head.card_id ? s.pending : null;
  const failedHere =
    s.failed && head && s.failed.cardId === head.card_id ? s.failed : null;

  return (
    <UiRoot>
      <div className="page">
        <div
          ref={rootRef}
          className="app bare focus"
          data-scheme={frameScheme(dev.theme)}
          data-size={dev.size}
          lang="en"
        >
          <Focus
            progress={focusProgress(s.status, s.meta.counts)}
            loading={loading}
            open={s.panel}
            onOpen={(what, from) => openPanel(what, from)}
          />
          <main
            className="app-main focus-main"
            id="main-content"
            aria-busy={loading ? "true" : undefined}
          >
            <div className="focus-col">
              {s.status === "failed" ? (
                <ReviewFailed
                  reference={s.ref}
                  onRetry={() => void reload({ silent: false })}
                />
              ) : (
                <>
                  <DueHead
                    counts={due.counts}
                    rows={due.rows}
                    open={s.bybook}
                    note={due.note}
                    saved={s.saved}
                    loading={loading}
                    onBooks={(open) => set((q) => ({ ...q, bybook: open }))}
                  />
                  {loading ? <CardSkeleton /> : null}
                  {ready && head && kind === "card" && form ? (
                    <ReviewCardView
                      key={head.card_id}
                      card={head}
                      form={form}
                      spec={spec}
                      meta={s.meta}
                      st={st}
                      sending={sending}
                      failed={failedHere}
                      onAct={act}
                      onRate={rate}
                      onRetry={retry}
                      onSuspend={suspend}
                    />
                  ) : null}
                  {ready && head && kind === "card" && !form ? (
                    <OldView settings={dev}>
                      <OldCardView
                        key={head.card_id}
                        card={head}
                        spec={spec}
                        meta={s.meta}
                        st={st}
                        pending={sending}
                        failed={failedHere}
                        onAct={act}
                        onRate={rate}
                        onRetry={retry}
                        onSuspend={suspend}
                      />
                    </OldView>
                  ) : null}
                  {ready && kind !== null && kind !== "card" ? (
                    <ReviewEndBody
                      view={endView(kind, s.meta)}
                      cont={s.next ? contView(s.next) : null}
                      onLimits={(el) => openPanel("settings", el)}
                    />
                  ) : null}
                </>
              )}
            </div>
            <div className="toast-region" role="status" aria-live="polite">
              {s.toast?.kind === "undo" ? (
                <div className="toast">
                  <span>{s.toast.text}</span>
                  <button type="button" className="btn" onClick={undo}>
                    {REVIEW.suspend.undo}
                  </button>
                </div>
              ) : null}
              {s.toast?.kind === "retry" ? (
                <div className="notice notice-danger" role="alert">
                  <span>{s.toast.text}</span>
                  <button type="button" className="btn" onClick={toastRetry}>
                    {REVIEW.suspend.tryAgain}
                  </button>
                </div>
              ) : null}
            </div>
          </main>
          <Sheet
            open={s.panel === "settings"}
            title={REVIEW.settings.title}
            side="end"
            onClose={() => closePanel()}
            returnFocus={returnFocus}
          >
            {s.draft ? (
              <Schedule
                draft={s.draft}
                phase={s.phase}
                attempt={s.attempt}
                zones={zones}
                onField={field}
                onSave={saveSettings}
                onCancel={closePanel}
              />
            ) : null}
          </Sheet>
          <Sheet
            open={s.panel === "display"}
            title={READER_FRAME.sheets.display}
            side="end"
            onClose={() => closePanel()}
            returnFocus={returnFocus}
          >
            <Display
              size={dev.size}
              theme={dev.theme}
              deviceScheme={os}
              onSize={(size) => apply({ size: size as TextSize })}
              onTheme={(theme) => apply({ theme: theme as ThemeChoice })}
            />
          </Sheet>
        </div>
      </div>
    </UiRoot>
  );
}
