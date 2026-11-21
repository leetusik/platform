import { WS_GLOSSARY } from "@/content/workspace/frame";
import { WS_SLICE } from "@/content/workspace/slice";
import {
  BackRow,
  Fact,
  Facts,
  type WsBack,
  type WsSyncLine,
} from "@/sikstack/workspace/frame";

const H = WS_GLOSSARY.heads;
const S = WS_GLOSSARY.labels.slice;

/** The labels the loading head keeps standing, over bars. */
const WAIT_FACTS = [S.risk, S.dependsOn, S.started, S.completed];

/**
 * The head while the slice loads (`SliceHead.dc.html`, loading): the back link and the id stand; bars hold the
 * name, the status, the sync line and each fact's value under its label.
 */
export function SliceHeadLoading({
  full,
  back,
  line,
}: {
  full: string;
  back: WsBack;
  line: WsSyncLine;
}) {
  return (
    <header className="page-top" aria-busy="true">
      <BackRow
        {...back}
        ariaLabel={WS_SLICE.back(back.label)}
        line={line}
        loading
      />
      <div className="page-head ws-head">
        <div className="page-title">
          <h1 className="slice-wait">
            <span className="ws-id">{full}</span>
            <span className="skel" style={{ width: "9em" }} />
          </h1>
          <span className="skel" style={{ width: "6em" }} />
          <span className="sr-only">{WS_SLICE.loading}</span>
        </div>
      </div>
      <div className="stack slice-about">
        <Facts>
          {WAIT_FACTS.map((label) => (
            <Fact key={label} label={label}>
              <span className="skel" style={{ width: "2em" }} />
            </Fact>
          ))}
        </Facts>
      </div>
    </header>
  );
}

/**
 * The slice's page while it loads (`Slice.dc.html`, Loading): the head's bars, then a Plan panel with its head
 * and six bars on 24 px lines, `aria-busy` and `Loading…` for a screen reader.
 */
export function SliceLoading({
  full,
  back,
  line,
}: {
  full: string;
  back: WsBack;
  line: WsSyncLine;
}) {
  return (
    <div className="column">
      <SliceHeadLoading full={full} back={back} line={line} />
      <section
        className="panel"
        aria-labelledby="slice-plan-wait"
        aria-busy="true"
      >
        <div className="panel-head">
          <h2 id="slice-plan-wait">{H.plan}</h2>
        </div>
        <div className="panel-body has-rule stack slice-skel">
          {["6em", "34em", "30em", "9em", "26em", "32em"].map((w, i) => (
            <p key={i}>
              <span className="skel" style={{ width: w }} />
            </p>
          ))}
          <span className="sr-only">{WS_SLICE.loading}</span>
        </div>
      </section>
    </div>
  );
}
