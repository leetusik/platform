import { WS_GLOSSARY } from "@/content/workspace/frame";
import { WsProse, WsProseBlock } from "@/hi2vi/workspace/frame/prose";
import { Md } from "@/hi2vi/workspace/md";
import {
  Fact,
  Facts,
  ItemHead,
  RefusedBadge,
  Steps,
  WaitingBadge,
  WsList,
  WsRow,
  wsStatus,
  type WsBack,
  type WsSyncLine,
} from "@/hi2vi/workspace/frame";
import { agendaItemHref, phaseHref, sliceHref } from "@/lib/workspace/address";
import { langOf } from "@/lib/workspace/model";
import type {
  AgendaItem,
  ItemState,
  Job,
  PhaseRow,
} from "@/lib/workspace/types";

import { isSliceId, promotedSub } from "./job-model";

/**
 * One deferred job (`DeferredJob.dc.html`, frame.md F35, F44, F48, F80, F85), one column, 24 px between parts:
 *
 * - the way back **Deferred** (to the list's page, search and status) and the sync line;
 * - the title row: the id, the title, the status on its baseline;
 * - a promoted job's **Promoted to**: the phase's row (its current slice, `S4 <name>`, under its name while it is not done,
 *   its status, the count and the steps); it opens that phase;
 * - the facts: a dropped job's **Dropped because** first, on its own line; **Source** (a slice's full id, a
 *   link to that slice); **Trigger**; **Created**; **Deferred because**, on its own line;
 * - **Brief** through `Md` (its headings one step under the panel's `h2`, no outline);
 * - the job's **Agenda item**: its row with the state it reads and, at its end, the mark of a change made on
 *   the web; it opens that item.
 */
export function DeferredJob({
  project,
  job,
  back,
  line,
  created,
  phase,
  item,
}: {
  project: string;
  job: Job;
  back: WsBack;
  line: WsSyncLine;
  /** The job's created date, in the viewer's zone (F2). */
  created: string;
  phase: PhaseRow | null;
  item: { item: AgendaItem; state: ItemState } | null;
}) {
  const g = WS_GLOSSARY;
  const labels = g.labels.job;
  const dropped = job.status === "dropped" && job.dropped ? job.dropped : null;
  const source = job.source ?? "";
  return (
    <div className="stack gap-5">
      <ItemHead
        back={back}
        line={line}
        id={job.id}
        name={job.title ?? ""}
        lang={job.lang === "ko" ? "ko" : "en"}
        status={wsStatus("job", job.status)}
      />
      {phase ? (
        <section className="panel" aria-label={g.heads.promotedTo}>
          <div className="panel-head">
            <h2>{g.heads.promotedTo}</h2>
          </div>
          <WsList longest={phase.total}>
            <WsRow
              id={phase.id}
              name={phase.name ?? ""}
              href={phaseHref(project, phase.id)}
              lang={langOf(phase.name) === "ko" ? "ko" : null}
              {...promotedSub(phase)}
              status={wsStatus("phase", phase.status)}
              end={
                <Steps
                  done={phase.done}
                  total={phase.total}
                  live={
                    phase.status === "in_progress" && phase.done < phase.total
                  }
                  className="ws-end"
                />
              }
            />
          </WsList>
        </section>
      ) : null}
      <Facts>
        {dropped ? (
          <Fact label={labels.droppedBecause} long className="ws-prose">
            <WsProseBlock text={dropped} />
          </Fact>
        ) : null}
        {isSliceId(source) ? (
          <Fact
            label={labels.source}
            links={[{ id: source, href: sliceHref(project, source) }]}
          />
        ) : (
          <Fact label={labels.source} className="ws-prose">
            {source ? <WsProse text={source} /> : g.none}
          </Fact>
        )}
        <Fact label={labels.trigger} className="ws-prose">
          {job.trigger ? <WsProse text={job.trigger} /> : g.none}
        </Fact>
        <Fact label={labels.created}>{created}</Fact>
        {job.reason ? (
          <Fact label={labels.deferredBecause} long className="ws-prose">
            <WsProseBlock text={job.reason} />
          </Fact>
        ) : null}
      </Facts>
      {job.brief ? (
        <section className="panel" aria-label={g.heads.brief}>
          <div className="panel-head">
            <h2>{g.heads.brief}</h2>
          </div>
          <div className="panel-body has-rule">
            <Md source={job.brief} level={3} anchor={`brief-${job.id}`} />
          </div>
        </section>
      ) : null}
      {item ? (
        <section className="panel" aria-label={g.heads.agendaItem}>
          <div className="panel-head">
            <h2>{g.heads.agendaItem}</h2>
          </div>
          <WsList>
            <WsRow
              id={item.item.id}
              name={item.item.title ?? ""}
              href={agendaItemHref(project, item.item.id)}
              lang={item.item.lang === "ko" ? "ko" : null}
              status={wsStatus("item", item.state)}
              end={
                item.item.sync ? (
                  <span className="ws-end">
                    {item.item.sync === "waiting" ? (
                      <WaitingBadge />
                    ) : (
                      <RefusedBadge />
                    )}
                  </span>
                ) : null
              }
            />
          </WsList>
        </section>
      ) : null}
    </div>
  );
}
