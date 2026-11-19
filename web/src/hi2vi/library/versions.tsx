import { LANGUAGES, VERSIONS } from "@/content/library-frame";

/**
 * Versions (`Versions.dc.html`, frame.md F62, F96): the body of the Version history sheet. Newest first;
 * each row is `v3`, **Current** on the newest, `Published Nov 2` and, for a translation, `Translated
 * from English v2`; the one being read says **Reading now**, every other has **View** (`onView(n)`).
 * One version adds `This is the only version.`; failed reads `Version history did not load.` with
 * **Try again** (`onRetry`), and the text itself stands. `published` is the date already formatted.
 */
export interface VersionItem {
  n: number;
  published: string;
  /** The version of the source language a translation was made from. */
  from?: { lang: string; version: number } | null;
}

export interface VersionsProps {
  versions: readonly VersionItem[];
  /** The version on screen; the newest when left out. */
  reading?: number;
  failed?: boolean;
  onView?: (n: number) => void;
  onRetry?: () => void;
}

export function Versions({
  versions,
  reading,
  failed = false,
  onView,
  onRetry,
}: VersionsProps) {
  const newest = versions.length ? versions[0].n : 1;
  const now = reading ?? newest;
  return (
    <div className="versions">
      {failed ? (
        <div className="block" style={{ padding: 0 }}>
          <p className="block-text">{VERSIONS.failed}</p>
          <button type="button" className="btn" onClick={onRetry}>
            {VERSIONS.retry}
          </button>
        </div>
      ) : (
        <>
          <ol className="version-list" aria-label={VERSIONS.list}>
            {versions.map((v) => (
              <li
                key={v.n}
                className="row version-row"
                aria-current={v.n === now ? "true" : undefined}
              >
                <span className="version-name">
                  <span className="strong">{VERSIONS.label(v.n)}</span>
                  {v.n === newest && (
                    <span className="badge">{VERSIONS.current}</span>
                  )}
                </span>
                <span className="version-facts">
                  <span>{VERSIONS.published(v.published)}</span>
                  {v.from && (
                    <span>
                      {VERSIONS.translatedFrom(
                        LANGUAGES[v.from.lang]?.name ?? v.from.lang,
                        v.from.version,
                      )}
                    </span>
                  )}
                </span>
                {v.n === now ? (
                  <span className="status status-live">
                    {VERSIONS.readingNow}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    aria-label={VERSIONS.viewAria(v.n)}
                    onClick={() => onView?.(v.n)}
                  >
                    {VERSIONS.view}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {versions.length === 1 && (
            <p className="block-text">{VERSIONS.only}</p>
          )}
        </>
      )}
    </div>
  );
}
