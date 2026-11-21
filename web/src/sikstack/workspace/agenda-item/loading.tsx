import { AGENDA_ITEM } from "@/content/workspace/agenda-item";

import { BackRow, type WsBack, type WsSyncLine } from "../frame";

import { HeadActions, HeadFactsLoading } from "./head";
import { PhasesLoading } from "./lists";
import { headActions } from "./model";

/** The sync line is a bar while the page loads: its words are not read. */
const LOADING_LINE: WsSyncLine = {
  state: "fresh",
  text: "",
  cls: "",
  version: "",
};

/**
 * An agenda item while it loads (`AgendaItem.dc.html`, Loading): the back row with the sync line as a bar; the
 * title and the two dates as bars, the head's buttons in their places, disabled; a Phases panel with three
 * skeleton rows of a real row's height. It reads nothing.
 */
export function AgendaItemLoading({ back }: { back: WsBack }) {
  return (
    <div className="column">
      <header className="page-top" aria-busy="true">
        <BackRow {...back} line={LOADING_LINE} loading />
        <div className="page-head ws-head agendaitem-row">
          <div className="page-title">
            <h1>
              <span className="skel" style={{ width: "12em" }} />
              <span className="sr-only">{AGENDA_ITEM.loading}</span>
            </h1>
          </div>
          <HeadActions actions={headActions("open")} loading />
        </div>
        <HeadFactsLoading />
      </header>
      <PhasesLoading />
    </div>
  );
}
