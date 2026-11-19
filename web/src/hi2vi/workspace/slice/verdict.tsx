import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { WS_GLOSSARY } from "@/content/workspace/frame";
import { wsStatus } from "@/hi2vi/workspace/frame";
import { remarkWorkspaceMd } from "@/hi2vi/workspace/md";
import type { Verdict } from "@/lib/workspace/types";

import { verdictFields, verdictFiles, verdictValue } from "./model";

const V = WS_GLOSSARY.labels.verdict;

/**
 * A result's verdict (`SliceVerdict.dc.html`), inside the Result panel: five short facts in one wrapping row
 * (**Returned**, what the executor returned, in the slice's words; **Route**, **Model**, **Effort** as written;
 * **Files changed**, a number or `—`), then up to four sentences 16 px under them, each Markdown in `.md`: the
 * same renderer as `Md` (GitHub's tables, raw HTML never rendered), its headings kept off the page's outline.
 */
export function SliceVerdict({
  verdict,
  outcome,
}: {
  verdict: Verdict;
  outcome: string | null;
}) {
  const returned = wsStatus("slice", verdict.status);
  const fields = verdictFields(verdict, outcome);
  return (
    <div className="slice-verdict">
      <dl className="facts">
        <div className="fact">
          <dt>{V.returned}</dt>
          <dd>
            {returned ? (
              <span className={returned.cls}>{returned.word}</span>
            ) : (
              WS_GLOSSARY.none
            )}
          </dd>
        </div>
        <div className="fact">
          <dt>{V.route}</dt>
          <dd>{verdictValue(verdict.route)}</dd>
        </div>
        <div className="fact">
          <dt>{V.model}</dt>
          <dd>{verdictValue(verdict.model)}</dd>
        </div>
        <div className="fact">
          <dt>{V.effort}</dt>
          <dd>{verdictValue(verdict.effort)}</dd>
        </div>
        <div className="fact">
          <dt>{V.filesChanged}</dt>
          <dd>{verdictFiles(verdict.files)}</dd>
        </div>
      </dl>
      {fields.length ? (
        <dl className="slice-fields">
          {fields.map((f, i) => (
            <div key={f.label} className="slice-field">
              <dt>{f.label}</dt>
              <dd className="md">
                <Markdown
                  remarkPlugins={[
                    remarkGfm,
                    [
                      remarkWorkspaceMd,
                      { level: 4, anchor: `verdict-${i + 1}` },
                    ],
                  ]}
                >
                  {f.text}
                </Markdown>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
