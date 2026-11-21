import { WS_GLOSSARY } from "@/content/workspace/frame";
import { WS_SLICE } from "@/content/workspace/slice";
import type { WsBack, WsSyncLine } from "@/sikstack/workspace/frame";
import { Md } from "@/sikstack/workspace/md";
import type { Slice } from "@/lib/workspace/types";

import { SliceCommits } from "./commits";
import { SliceHead } from "./head";
import { planOutline, resultPart, type SliceCommit } from "./model";
import { SliceVerdict } from "./verdict";

const H = WS_GLOSSARY.heads;

/**
 * A slice at its own address (`Slice.dc.html`): one column, its parts 24 px apart. The head; **Result** (the
 * verdict, then the result's text), only once the slice has one, or the done slice's one sentence; **Commits**,
 * only when it has some; **Plan**, always, with its Sections list from five sections, or its empty sentence.
 */
export function SlicePage({
  slice,
  commits,
  back,
  line,
  date,
  depHref,
}: {
  slice: Slice;
  commits: readonly SliceCommit[];
  back: WsBack;
  line: WsSyncLine;
  date: (value: string | null | undefined) => string;
  depHref: (full: string) => string;
}) {
  const result = resultPart(slice);
  return (
    <div className="column">
      <SliceHead
        slice={slice}
        back={back}
        line={line}
        date={date}
        depHref={depHref}
      />
      {result === "result" && slice.result ? (
        <section className="panel" aria-labelledby="slice-result-head">
          <div className="panel-head">
            <h2 id="slice-result-head">{H.result}</h2>
          </div>
          <div className="panel-body has-rule">
            <SliceVerdict
              verdict={slice.result.verdict}
              outcome={slice.outcome}
            />
          </div>
          {slice.result.body.trim() ? (
            <div className="panel-body has-rule">
              <Md source={slice.result.body} level={3} anchor="result" />
            </div>
          ) : null}
        </section>
      ) : null}
      <SliceCommits commits={commits} />
      {result === "none" ? (
        <section className="panel" aria-labelledby="slice-result-none">
          <div className="panel-head">
            <h2 id="slice-result-none">{H.result}</h2>
          </div>
          <div className="panel-body has-rule block">
            <p className="block-text">{WS_SLICE.noResult}</p>
          </div>
        </section>
      ) : null}
      <section className="panel" aria-labelledby="slice-plan-head">
        <div className="panel-head">
          <h2 id="slice-plan-head">{H.plan}</h2>
        </div>
        {slice.plan ? (
          <div className="panel-body has-rule">
            <Md
              source={slice.plan}
              dropTitle
              outline={planOutline(slice.plan)}
              level={3}
              anchor="plan"
            />
          </div>
        ) : (
          <div className="panel-body has-rule block">
            <p className="block-text">{WS_SLICE.noPlan}</p>
          </div>
        )}
      </section>
    </div>
  );
}
