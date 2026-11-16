import { AnnotationLayer } from "@/components/reader/annotations";
import { MathLayer } from "@/components/reader/math-layer";
import { PrintPrep } from "@/components/reader/print-client";
import { PrintColophon, PrintMasthead } from "@/components/reader/print-sheet";
import { TermLayer } from "@/components/reader/term-layer";
import { ChapterView, documentAssets } from "@/lib/native";
import { HOOK } from "@/lib/native/look";
import type { QuizViewContext } from "@/lib/native/render";
import { layerOn } from "@/lib/reader/layer";
import type { LoadedReader } from "@/lib/reader/load";

import { OldRoot } from "../old-root";
import { PaperLight } from "./paper";

/**
 * The body of a text in the Library's reader (P63-fk.S9; job 03, Library round 02: frame.md F60, `## Build`
 * § Page: chapter's `Read` and § Page: blocks). Server-rendered, mounted in the frame's `.read-flow`:
 *
 *   div.blocks-host[data-reader-article]          the article: the layers' host and their floating parts' box
 *     OldRoot (still) > PrintMasthead, PrintPrep  paper's masthead, as today (print only)
 *     div[data-reader-prose][lang]
 *       ChapterView look="library"                div.read[data-reader-body]: the text, its blocks, its islands
 *     OldRoot (still) > PrintColophon             paper's colophon, as today (print only)
 *     MathLayer                                   the math's measures (renders nothing)
 *     OldRoot (still, with the Listen slot and the player)
 *       AnnotationLayer, TermLayer                highlights, notes and bookmarks (S11), terms (S10): old look
 *     PaperLight                                  the light scheme for a print
 *
 * The layers keep their old look until their slices (S10, S11) and find the body by its hooks (`HOOK`); their own
 * elements sit in the old root, which adds no box (`still`), so they place their windows and bars against this
 * article, as they did against the old one. The text itself is the Library's look only: no class the old sheets
 * style (`tests/reader-body.test.ts`), but inside its islands.
 */
export function ChapterBody({ reader }: { reader: LoadedReader }) {
  const { view, checked } = reader;
  const loose = view.kind === "loose" || view.book === null;
  // The quiz island's context, as the old article built it (P30.S19).
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
    <div className="blocks-host" {...{ [HOOK.article]: "" }}>
      <OldRoot slot={false} still>
        <PrintMasthead view={view} />
        <PrintPrep />
      </OldRoot>
      <div {...{ [HOOK.prose]: "" }} lang={view.lang}>
        <ChapterView
          checked={checked}
          lang={view.lang}
          look="library"
          hooks
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
      <OldRoot slot={false} still>
        <PrintColophon view={view} />
      </OldRoot>
      <MathLayer chapter={chapter} />
      <OldRoot still>
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
      </OldRoot>
      <PaperLight />
    </div>
  );
}
