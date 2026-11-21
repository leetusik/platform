import type { ReactNode } from "react";

import { HOOK } from "@/lib/native/look";

import { OldRoot } from "../old-root";

/**
 * An old-look island in the Library's body (P63-fk.S9, the orchestrator's decision 4): a part of the text a later
 * slice rebuilds (the quiz, the glossary's entries and the terms' windows: S10; a drawing the signed Drawing does
 * not draw; the paper's answer key), drawn in its old look and kept operable until then. It sits in the old root
 * (`OldRoot`: `Legacy > div.rd-root`, the old tokens, text size and scheme), inside `div.kb-ch` (the old body's
 * class, which the old rules of these parts are scoped to). Every box of it is `display: contents`
 * (`OldRoot`'s `still`): the island adds no box, no gap and no positioning box to the body, so its parts sit
 * in the text's flow and place their floating windows against the reader's article, as they did in the old one.
 *
 * `data-island` marks it for the layers (Listen's following reads its content as the body's own blocks);
 * `data-island-body` holds the content. The slices that rebuild these parts remove their islands.
 */
const CONTENTS = { display: "contents" } as const;

export function OldIsland({ children }: { children: ReactNode }) {
  return (
    <div {...{ [HOOK.island]: "" }} style={CONTENTS}>
      <OldRoot still>
        <div className="kb-ch" {...{ [HOOK.islandBody]: "" }} style={CONTENTS}>
          {children}
        </div>
      </OldRoot>
    </div>
  );
}
