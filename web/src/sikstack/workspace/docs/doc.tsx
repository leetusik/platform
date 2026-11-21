import Link from "next/link";

import { WS_DOCS } from "@/content/workspace/docs";
import { WS_GLOSSARY } from "@/content/workspace/frame";
import { Fact, Facts } from "@/sikstack/workspace/frame/facts";
import type { WsBack } from "@/sikstack/workspace/frame/states-model";
import type { WsSyncLine } from "@/sikstack/workspace/frame/sync-model";
import { WsProse } from "@/sikstack/workspace/frame/prose";
import { WsText } from "@/sikstack/workspace/frame/text";
import { Md } from "@/sikstack/workspace/md";

import { DocBackRow } from "./head";
import type {
  DocView,
  EarlierNotice,
  StaleNotice,
  VersionRowView,
} from "./model";

/** A stale doc's notice: `4 notes from P7-m3 and P8-q4 are not folded into this doc yet.`, each id a link. */
function Stale({ notice }: { notice: StaleNotice }) {
  const n = notice.phases.length;
  return (
    <p className="notice docs-notice">
      {notice.count}
      {WS_DOCS.stale.from}
      {notice.phases.map((ph, i) => (
        <span key={ph.id}>
          <Link href={ph.href}>{ph.id}</Link>
          {i === n - 1 ? "" : i === n - 2 ? " and " : ", "}
        </span>
      ))}
      {WS_DOCS.stale.rest(notice.single)}
    </p>
  );
}

/** An earlier version's notice: `The current version is v14, versioned Oct 28.`, `v14` a link to the doc. */
function Earlier({ notice }: { notice: EarlierNotice }) {
  return (
    <p className="notice docs-notice">
      {WS_DOCS.earlier.before}
      <Link href={notice.href}>{notice.current}</Link>
      {WS_DOCS.earlier.after(notice.currentDate)}
    </p>
  );
}

/** The Earlier versions panel (`DocsVersions.dc.html`): newest first, the version (the row's link), its day, its summary. */
export function DocVersions({ rows }: { rows: VersionRowView[] }) {
  return (
    <section className="panel" aria-labelledby="docs-vers-head">
      <div className="panel-head">
        <h2 id="docs-vers-head">{WS_GLOSSARY.heads.earlierVersions}</h2>
      </div>
      <ul className="docs-vers">
        {rows.map((v) => (
          <li key={v.href} className="row docs-ver">
            <Link
              className="link-strong docs-ver-open"
              href={v.href}
              aria-label={v.label}
            >
              {v.version}
            </Link>
            <span className="dim docs-ver-date">{v.date}</span>
            <span className="docs-ver-sum ws-prose">
              <WsProse text={v.summary} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A doc, or an earlier version of it (`Docs.dc.html`, F35): the back row, the title row (the `h1`, then the status,
 * or the badge **Earlier version**), the notice, the facts, panel **Text** with `Md` and its outline, and Earlier
 * versions on a doc that has them.
 */
export function DocPage({
  view,
  back,
  line,
}: {
  view: DocView;
  back: WsBack;
  line: WsSyncLine;
}) {
  const earlier = view.kind === "earlier";
  return (
    <>
      <header className="page-top">
        <DocBackRow
          back={back}
          ariaLabel={WS_DOCS.backTo(back.label)}
          lang={earlier ? view.lang : undefined}
          line={line}
        />
        <div className="page-head ws-head">
          <div className="page-title">
            <h1 lang={view.lang === "ko" ? "ko" : undefined}>{view.heading}</h1>
            {view.status ? (
              <span className={view.status.cls}>{view.status.word}</span>
            ) : null}
            {earlier ? (
              <span className="badge">
                {WS_GLOSSARY.sentences.earlierVersion}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {view.notice?.kind === "stale" ? <Stale notice={view.notice} /> : null}
      {view.notice?.kind === "earlier" ? (
        <Earlier notice={view.notice} />
      ) : null}
      <Facts>
        {view.facts.map((f) => (
          <Fact key={f.label} label={f.label}>
            {f.ids ? <WsText text={f.value} /> : f.value}
          </Fact>
        ))}
      </Facts>
      <section className="panel" aria-labelledby="docs-text-head">
        <div className="panel-head">
          <h2 id="docs-text-head">{WS_GLOSSARY.heads.text}</h2>
          <p className="meta">{view.sectionCount}</p>
        </div>
        <div className="panel-body has-rule">
          <Md source={view.source} outline level={3} anchor="doc" />
        </div>
      </section>
      {view.versions.length > 0 ? <DocVersions rows={view.versions} /> : null}
    </>
  );
}
