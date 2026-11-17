import { createElement, type CSSProperties, type HTMLAttributes } from "react";

import { cx } from "@/lib/cx";

/**
 * The layout primitives (bundle section 3): `.stack`, `.cluster`, `.split`, `.sidebar` (with `.side`
 * and `.main`), `.center`, `.grid`, and the gaps `.gap-1` to `.gap-7`. The props are the bundle's own
 * modifiers: `baseline` (`.baseline`), `topAligned` (`.top-aligned`), `toEnd` (`.to-end`), and the
 * grid's `--grid-min`. `as` picks the element (a list is `ul`, a part is `section`).
 */
export type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Tag =
  | "div"
  | "section"
  | "header"
  | "footer"
  | "nav"
  | "ul"
  | "ol"
  | "li"
  | "dl"
  | "p"
  | "span"
  | "form";

export interface LayoutProps extends HTMLAttributes<HTMLElement> {
  as?: Tag;
  gap?: Gap;
  baseline?: boolean;
  topAligned?: boolean;
  toEnd?: boolean;
}

function layout(base: string) {
  function Primitive({
    as = "div",
    gap,
    baseline = false,
    topAligned = false,
    toEnd = false,
    className,
    ...rest
  }: LayoutProps) {
    return createElement(as, {
      ...rest,
      className: cx(
        base,
        gap !== undefined && `gap-${gap}`,
        baseline && "baseline",
        topAligned && "top-aligned",
        toEnd && "to-end",
        className,
      ),
    });
  }
  Primitive.displayName = base;
  return Primitive;
}

export const Stack = layout("stack");
export const Cluster = layout("cluster");
export const Split = layout("split");
export const Sidebar = layout("sidebar");
export const SidebarSide = layout("side");
export const SidebarMain = layout("main");
export const Center = layout("center");

export interface GridProps extends LayoutProps {
  /** The narrowest a cell gets before the grid wraps (`--grid-min`, default 24em). */
  min?: string;
}

const GridBase = layout("grid");

export function Grid({ min, style, ...rest }: GridProps) {
  return (
    <GridBase
      {...rest}
      style={
        min === undefined
          ? style
          : ({ ...style, "--grid-min": min } as CSSProperties)
      }
    />
  );
}

/** `.grow`: the part of a cluster or split that takes the room left. */
export const Grow = layout("grow");
