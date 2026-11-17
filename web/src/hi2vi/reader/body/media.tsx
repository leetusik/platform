"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { READER_BLOCKS } from "@/content/reader-blocks";

import { ratioOf } from "./ratio";

/**
 * A figure's image in the Library's body (job 03 round 02, `BlocksFigure.dc.html`; `## Build` § Page: blocks):
 * `.blocks-fig-media` on the image's own ratio (`--fig-w` / `--fig-h`), and, when the version holds no such image or
 * the image fails to load, the missing place (`.blocks-fig-miss`): the same ratio, never shorter than its own words,
 * **Image not available** and the image's description.
 *
 * Both carry `data-an-skip`: an image's description is not the text, so anchoring counts nothing for it (as the old
 * image box did).
 */

/** The missing image's place: its ratio and its words. */
export function MissingMedia({
  w,
  h,
  children,
}: {
  w: number | null;
  h: number | null;
  /** The image's description, with its Hangul runs wrapped. */
  children?: ReactNode;
}) {
  return (
    <span
      className="blocks-fig-media blocks-fig-miss"
      style={ratioOf(w, h)}
      data-an-skip=""
    >
      <b>{READER_BLOCKS.figure.missing}</b>
      <span>{children}</span>
    </span>
  );
}

/** The image, or its missing place once it fails to load (after the page rendered or before it hydrated). */
export function Media({
  src,
  still,
  alt,
  title,
  w,
  h,
  missingAlt,
}: {
  src: string;
  /** An animated image's first frame, shown under `prefers-reduced-motion: reduce`. */
  still: string | null;
  alt: string;
  title?: string;
  w: number | null;
  h: number | null;
  missingAlt: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);
  const settle = useCallback((el: HTMLImageElement) => {
    if (el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  useEffect(() => {
    // An image that failed before this component hydrated fired its error unheard.
    if (img.current) settle(img.current);
  }, [settle]);
  if (failed)
    return (
      <MissingMedia w={w} h={h}>
        {missingAlt}
      </MissingMedia>
    );
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- a version's own asset, sized from its asset map
    <img
      ref={img}
      className="blocks-fig-media"
      style={ratioOf(w, h)}
      src={src}
      alt={alt}
      title={title}
      width={w ?? undefined}
      height={h ?? undefined}
      loading="lazy"
      decoding="async"
      data-an-skip=""
      onError={() => setFailed(true)}
    />
  );
  return still ? (
    <picture data-an-skip="">
      <source media="(prefers-reduced-motion: reduce)" srcSet={still} />
      {image}
    </picture>
  ) : (
    image
  );
}
