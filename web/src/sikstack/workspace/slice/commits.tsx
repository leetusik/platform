import { WS_GLOSSARY } from "@/content/workspace/frame";
import { WS_SLICE } from "@/content/workspace/slice";

import type { SliceCommit } from "./model";

const C = WS_SLICE.commits;

/**
 * A slice's commits (`SliceCommits.dc.html`, frame.md F305): with none it draws nothing. Otherwise a panel,
 * **Commits** and `2 commits`, one row a commit: the short SHA in the mono face, the subject as the row's link to
 * the commit on GitHub (`Commit 4f1c2a9 in platform on GitHub: …`), and the repo.
 */
export function SliceCommits({ commits }: { commits: readonly SliceCommit[] }) {
  if (commits.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="slice-commits-head">
      <div className="panel-head">
        <h2 id="slice-commits-head">{WS_GLOSSARY.heads.commits}</h2>
        <p className="meta">{C.count(commits.length)}</p>
      </div>
      <ul className="ws-list">
        {commits.map((c) => (
          <li key={`${c.repo}:${c.sha}`} className="row ws-row">
            <span className="ws-id sc-sha">{c.short}</span>
            <a
              className="link-strong ws-open ws-name"
              href={c.url}
              aria-label={C.label(c.short, c.repo, c.subject)}
            >
              <span className="row-stack">
                <span className="ws-name-text">{c.subject}</span>
              </span>
            </a>
            <span className="dim ws-state">
              <span className="sr-only">{C.repo}</span>
              {c.repo}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
