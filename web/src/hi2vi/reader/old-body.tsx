import type { CSSProperties } from "react";

import { AnnotationLayer } from "@/components/reader/annotations";
import { MathLayer } from "@/components/reader/math-layer";
import { PrintPrep } from "@/components/reader/print-client";
import { PrintColophon, PrintMasthead } from "@/components/reader/print-sheet";
import { TermLayer } from "@/components/reader/term-layer";
import { ChapterView, documentAssets } from "@/lib/native";
import type { QuizViewContext } from "@/lib/native/render";
import { layerOn } from "@/lib/reader/layer";
import type { LoadedReader } from "@/lib/reader/load";

import { OldRoot } from "./old-root";

/**
 * THE BRIDGE's server half (P63-fk.S8): a chapter's body as the old reader rendered it
 * (`components/reader/reader-article.tsx`, less its head and end, which the new frame draws), mounted
 * unchanged inside the old root (`./old-root.tsx`). The print masthead, the colophon and their island
 * keep ⌘P printing as today. The slices that rebuild the body (S9), the reading aids (S10) and the marks
 * (S11) replace what is here; the last of them removes this file.
 *
 * `.rd-article` holds the body, as before: the reader's memory finds its blocks there
 * (`.rd-article [data-block]`), the annotation layer its host. Its gutters are zero and its measure the
 * frame's column (`--rd-gut`, `--rd-measure`), so the old text lines up with the new head and end.
 */
const FILL_COLUMN = {
  "--rd-gut": "0px",
  "--rd-measure": "100%",
} as CSSProperties;

export function OldChapterBody({ reader }: { reader: LoadedReader }) {
  const { view, checked } = reader;
  const loose = view.kind === "loose" || view.book === null;
  // The quiz island's context, exactly as the old article built it (P30.S19).
  const quiz: QuizViewContext = {
    member: view.member,
    write: view.write,
    version: view.version,
    place: loose ? "document" : "chapter",
    lang: view.lang,
    signIn: {
      target: view.target,
      lang: view.langs.length > 1 ? view.lang : null,
      version: view.version < view.newest ? view.version : null,
    },
    saved: reader.quiz,
  };
  const chapter = `${reader.docId}:${view.version}:${view.lang}`;
  return (
    <OldRoot>
      <div className="rd-article" style={FILL_COLUMN}>
        <div className="rd-flow">
          <PrintMasthead view={view} />
          <PrintPrep />
          <div className="rd-prose" lang={view.lang}>
            <ChapterView
              checked={checked}
              lang={view.lang}
              omitTitle={checked.format === "md" ? view.title : null}
              quiz={quiz}
              links={{
                format: checked.format,
                assetInfo: documentAssets(reader.docId, reader.assets),
                resolveRef: reader.resolveRef,
                baseUrl: reader.baseUrl,
              }}
            />
          </div>
          <PrintColophon view={view} />
          <MathLayer chapter={chapter} />
          {reader.notes && layerOn(reader) ? (
            <AnnotationLayer
              notes={reader.notes}
              write={view.write}
              version={view.version}
              lang={view.lang}
              chapterTitle={view.title}
              place={loose ? "document" : "chapter"}
              target={view.target}
            />
          ) : null}
          <TermLayer chapter={chapter} />
        </div>
      </div>
    </OldRoot>
  );
}
