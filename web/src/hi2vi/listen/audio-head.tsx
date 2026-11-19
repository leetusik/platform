import type { Ref } from "react";

import { Control } from "./control";
import type { HeadView, ListenWhat } from "./model";
import { Held, Note } from "./note";

/**
 * AudioHead (`AudioHead.dc.html`, frame.md F206, F207): Listen's slot in a head, its own row under the head's
 * facts, at the column's left edge. Every form sits in one held cell (`.hold`) with the text's three tallest
 * notes hidden beside it, so nothing under the head moves when the word changes. Hook-free: the page's
 * mount (`./head-slot`) gives it `head` (`./model` `headOf`) and answers `onListen(what)`; the book page
 * and a document reuse it with their own `head`.
 */

export interface AudioHeadProps {
  head: HeadView;
  onListen?: (what: ListenWhat) => void;
  /** The slot's element: the reader measures it (the pill shows once it is under the top bar). */
  slotRef?: Ref<HTMLDivElement>;
}

export function AudioHead({ head, onListen, slotRef }: AudioHeadProps) {
  const emit = (what: ListenWhat) => () => onListen?.(what);
  return (
    <div className="listen-slot" lang="en" ref={slotRef}>
      <div className="hold">
        <div>
          {head.show === "note" && head.note ? (
            <Note
              note={head.note}
              act={head.act}
              updating={head.updating}
              onAct={(what) => onListen?.(what)}
            />
          ) : (
            <Control
              control={head.control}
              busy={head.show === "busy"}
              onListen={emit("listen")}
              onResume={emit("resume")}
              onStartOver={emit("startover")}
            />
          )}
        </div>
        {head.hold.map((n) => (
          <Held key={n.key} note={n} />
        ))}
      </div>
    </div>
  );
}
