"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { DEFERRED_LIST } from "@/content/workspace/deferred";
import { WS_PAGER, WS_STATES } from "@/content/workspace/frame";
import { PAGER } from "@/content/library-frame";
import { Pager } from "@/sikstack/library/pager";
import { useWsRetry, WsList, WsRow, wsStatus } from "@/sikstack/workspace/frame";
import { num } from "@/lib/format";
import { deferredHref, jobHref } from "@/lib/workspace/address";
import type { JobRow } from "@/lib/workspace/types";

import { DeferredFilter } from "./filter";
import {
  deferredListView,
  readDeferredPlace,
  withQuery,
  withStatus,
  type DeferredPlace,
} from "./list-model";

/**
 * The Deferred jobs list (`DeferredList.dc.html`, frame.md F300, F82): one panel, its head **Deferred jobs** with
 * the count (`role="status"`), the toolbar (the search, the status filter), the rows, the pager (50 a page).
 *
 * The page reads the Workspace once and hands every job here; the search, the status and the page are this
 * island's, kept in the address as they change (`?q=`, `?status=`, `?page=N`): typing replaces the address,
 * a page of the pager adds one, so Back returns to the page before. A search or a status change goes to page 1.
 * A row opens its job, carrying this list's place (`?from=`), so the way back returns to it. On a page change
 * the list's head comes into view. Each row's trigger is the server's drawing of its Markdown (`triggers`, from
 * `./prose`), since this island cannot carry the Markdown renderer; without one it is the stored text.
 */
export function DeferredList({
  project,
  jobs,
  created,
  triggers = {},
  place: initial,
}: {
  project: string;
  jobs: readonly JobRow[];
  /** Each job's created date, formatted in the viewer's zone (F2), by id. */
  created: Readonly<Record<string, string>>;
  /** Each job's trigger as the server drew it (`jobTriggers`), by id. */
  triggers?: Readonly<Record<string, ReactNode>>;
  place: DeferredPlace;
}) {
  const [place, setPlace] = useState<DeferredPlace>(initial);
  const head = useRef<HTMLElement>(null);
  const paged = useRef(false);

  // Back and Forward between the list's own pages: the address is the truth.
  useEffect(() => {
    const onPop = () =>
      setPlace(readDeferredPlace(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const view = deferredListView(jobs, place);

  useEffect(() => {
    if (!paged.current) return;
    paged.current = false;
    head.current?.scrollIntoView({ block: "start" });
  }, [view.place.page]);

  const go = (next: DeferredPlace, how: "push" | "replace") => {
    setPlace(next);
    const href = deferredHref(project, next);
    if (how === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  };

  const onPage = (n: number, event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    paged.current = true;
    go({ ...view.place, page: n }, "push");
  };

  const from = {
    list: "deferred" as const,
    q: view.place.q || undefined,
    status: view.place.status,
    page: view.place.page,
  };
  const w = DEFERRED_LIST;

  return (
    <section className="panel" aria-label={w.title} ref={head}>
      <div className="panel-head">
        <h2>{w.title}</h2>
        <p className="meta" role="status">
          {view.count}
        </p>
      </div>
      {view.tools ? (
        <div className="panel-body has-rule dj-tools">
          <div className="dj-find">
            <input
              className="input"
              type="search"
              autoComplete="off"
              aria-label={w.search.label}
              placeholder={w.search.placeholder}
              value={place.q}
              onChange={(e) => go(withQuery(place, e.target.value), "replace")}
            />
          </div>
          <DeferredFilter
            value={view.place.status}
            counts={view.counts}
            totals={view.totals}
            onPick={(key) => go(withStatus(place, key), "replace")}
          />
        </div>
      ) : null}
      {view.rows.length > 0 ? (
        <WsList>
          {view.rows.map((job) => (
            <WsRow
              key={job.id}
              id={job.id}
              name={job.title ?? ""}
              href={jobHref(project, job.id, from)}
              lang={job.lang === "ko" ? "ko" : null}
              sub={
                job.trigger ? (
                  <>
                    <span className="sr-only">{w.srTrigger}</span>
                    <span className="ws-prose">
                      {triggers[job.id] ?? job.trigger}
                    </span>
                  </>
                ) : null
              }
              status={wsStatus("job", job.status)}
              end={
                <span className="ws-end dj-end">
                  <span>
                    <span className="sr-only">{w.srSource}</span>
                    {job.source ?? ""}
                  </span>
                  <span className="dj-date">
                    <span className="sr-only">{w.srCreated}</span>
                    {created[job.id] ?? ""}
                  </span>
                </span>
              }
            />
          ))}
        </WsList>
      ) : null}
      {view.empty !== null ? (
        <div className="panel-body has-rule block">
          <p className="block-text">{view.empty}</p>
        </div>
      ) : null}
      {view.pager ? (
        <div className="panel-foot dj-foot">
          <Pager
            page={view.pager.page}
            pages={view.pager.pages}
            range={PAGER.range(
              num(view.pager.first),
              num(view.pager.last),
              num(view.listed),
            )}
            label={WS_PAGER.deferredJobs.label}
            hrefFor={(n) => deferredHref(project, { ...view.place, page: n })}
            onPage={onPage}
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * The list that did not load (`DeferredList.dc.html`, Failed; F49): the head stands with no count and no
 * toolbar; `Deferred jobs did not load.` and **Try again**, which reads the page again (`WsNav`'s sync line its
 * bar meanwhile, F40).
 */
export function DeferredListFailed() {
  const router = useRouter();
  const [, run] = useWsRetry();
  return (
    <section className="panel" aria-label={DEFERRED_LIST.title}>
      <div className="panel-head">
        <h2>{DEFERRED_LIST.title}</h2>
      </div>
      <div className="panel-body has-rule block">
        <p className="block-text">{WS_STATES.partFailed.deferred}</p>
        <button
          type="button"
          className="btn"
          onClick={() => run(() => router.refresh())}
        >
          {WS_STATES.retry}
        </button>
      </div>
    </section>
  );
}
