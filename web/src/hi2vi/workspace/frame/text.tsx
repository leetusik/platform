import { splitIds } from "./ids";

/** A workspace id as its own element, before a name or in a row: `span.ws-id`, never broken (frame.md F36, F43). */
export function WsId({ id }: { id: string }) {
  return <span className="ws-id">{id}</span>;
}

/**
 * A sentence with the workspace's ids in it (an outcome, a reason, a refusal, a notebook's line): each id
 * wrapped at render in `span.ws-nobr`, so it never breaks across lines (frame.md F80, join:N1).
 */
export function WsText({ text }: { text: string }) {
  return (
    <>
      {splitIds(text).map((part, i) =>
        part.id ? (
          <span key={i} className="ws-nobr">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
