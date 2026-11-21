import { WS_SLICE } from "@/content/workspace/slice";
import {
  Fact,
  Facts,
  ItemHead,
  wsStatus,
  type WsBack,
  type WsSyncLine,
} from "@/sikstack/workspace/frame";
import { WS_KIND } from "@/content/workspace/frame";
import { WsProse } from "@/sikstack/workspace/frame/prose";
import { langOf } from "@/lib/workspace/model";
import type { Slice } from "@/lib/workspace/types";

import { sliceFacts, sliceLead } from "./model";

/**
 * A slice's head (`SliceHead.dc.html`): the back row (the phase's id, `Back to P8-q4`, and the sync line);
 * the title line (the full id in `--ink-2`, the name, the status, the kind as a `.badge`); the one sentence and
 * a stop's words; then the facts, with **Depends on** as links to those slices.
 */
export function SliceHead({
  slice,
  back,
  line,
  date,
  depHref,
}: {
  slice: Slice;
  back: WsBack;
  line: WsSyncLine;
  date: (value: string | null | undefined) => string;
  depHref: (full: string) => string;
}) {
  const lead = sliceLead(slice);
  const name = slice.name ?? "";
  const kind = slice.kind ? (WS_KIND[slice.kind] ?? slice.kind) : null;
  return (
    <ItemHead
      back={back}
      backLabel={WS_SLICE.back(back.label)}
      line={line}
      id={slice.full}
      name={name}
      lang={langOf(name) === "ko" ? "ko" : null}
      status={wsStatus("slice", slice.status)}
      after={kind ? <span className="badge">{kind}</span> : null}
    >
      <div className="stack slice-about">
        {lead ? (
          <div className="stack gap-1">
            {lead.text ? (
              <p className="slice-lead-text ws-prose">
                <WsProse text={lead.text} />
              </p>
            ) : null}
            {lead.words ? (
              <p className="slice-words ws-prose">
                <WsProse text={lead.words} />
              </p>
            ) : null}
          </div>
        ) : null}
        <Facts>
          {sliceFacts(slice, date, depHref).map((f) =>
            f.links ? (
              <Fact key={f.label} label={f.label} links={f.links} />
            ) : (
              <Fact key={f.label} label={f.label}>
                {f.text}
              </Fact>
            ),
          )}
        </Facts>
      </div>
    </ItemHead>
  );
}
