import Link from "next/link";

import { SAVE, type SaveWhat } from "@/content/library-frame";

/**
 * Sign in to save (`Save.dc.html`, frame.md F64): offered in place, where the thing would have been
 * saved, never a dialog. `div.save[role=group]`: the title, one sentence for what is saved, **Sign in**
 * (`.btn`) and **Not now** (`button.link-row`). With `signInHref` Sign in is a link.
 */
export interface SaveProps {
  what: SaveWhat;
  onSignIn?: () => void;
  signInHref?: string;
  onNotNow?: () => void;
}

export function Save({ what, onSignIn, signInHref, onNotNow }: SaveProps) {
  return (
    <div className="save" role="group" aria-label={SAVE.title}>
      <p className="save-title">{SAVE.title}</p>
      <p>{SAVE.sentence[what]}</p>
      <div className="cluster gap-4">
        {signInHref ? (
          <Link className="btn" href={signInHref} onClick={onSignIn}>
            {SAVE.signIn}
          </Link>
        ) : (
          <button type="button" className="btn" onClick={onSignIn}>
            {SAVE.signIn}
          </button>
        )}
        <button type="button" className="link-row" onClick={onNotNow}>
          {SAVE.notNow}
        </button>
      </div>
    </div>
  );
}
