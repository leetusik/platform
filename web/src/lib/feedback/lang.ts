/**
 * A caller's text and its language (job 04 frame.md F125, F127): a message, a comment, a tag or a
 * target text is marked `lang="ko"` when it is Korean, so the Korean face and line breaking apply.
 *
 * The rule, with no model call: Korean when the text holds one Hangul syllable (U+AC00 to U+D7A3),
 * else the page's own language. Mixed text with a syllable is Korean: the signed boards mark f2's
 * target text `재생 속도 1.0× 1.25× 1.5× 2.0×` Korean, and the fixture's `ko()` and org home's
 * `langOf` read it the same way. A lone jamo (`ㅋㅋ`) is not a syllable and stays the page's.
 */

const HANGUL_SYLLABLE = /[가-힣]/;

/** The page's own language: the root layout's `lang`. */
export const PAGE_LANG = "en";

/** `ko` for Korean text, else the page's language. */
export function langOf(
  text: string | null | undefined,
  page: string = PAGE_LANG,
): string {
  return text && HANGUL_SYLLABLE.test(text) ? "ko" : page;
}

/** The `lang` attribute a text needs inside a page in `page`: none when it is the page's own. */
export function langAttr(
  text: string | null | undefined,
  page: string = PAGE_LANG,
): string | undefined {
  const lang = langOf(text, page);
  return lang === page ? undefined : lang;
}
