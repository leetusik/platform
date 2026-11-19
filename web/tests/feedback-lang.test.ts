import { describe, expect, it } from "vitest";

import { langAttr, langOf } from "@/lib/feedback/lang";

// A caller's text and its language (job 04 frame.md F125, F127; the fixture's `ko()`): Korean when the
// text holds a Hangul syllable, else the page's own language. No model is asked.

describe("langOf", () => {
  it("reads Korean text as ko and English text as the page's language", () => {
    expect(langOf("재생 속도를 기억해 주면 좋겠어요.")).toBe("ko");
    expect(
      langOf("Search finds the page but not the paragraph I was after."),
    ).toBe("en");
    expect(langOf("Search finds the page", "fr")).toBe("fr");
  });

  it("reads mixed text as Korean when it holds one Hangul syllable", () => {
    // f2's target text, which the Facts board marks lang="ko"
    expect(langOf("재생 속도 1.0× 1.25× 1.5× 2.0×")).toBe("ko");
    expect(langOf("Export to PDF 하면 코드가 깨져요")).toBe("ko");
    expect(langOf("e.g. 결제 or checkout")).toBe("ko");
  });

  it("reads no text, or a lone jamo, as the page's language", () => {
    expect(langOf("")).toBe("en");
    expect(langOf(null)).toBe("en");
    expect(langOf(undefined)).toBe("en");
    expect(langOf("ㅋㅋ")).toBe("en");
  });

  it("gives an attribute only where the text differs from the page", () => {
    expect(langAttr("검색 품질")).toBe("ko");
    expect(langAttr("search")).toBeUndefined();
    expect(langAttr(null)).toBeUndefined();
  });
});
