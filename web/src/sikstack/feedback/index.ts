// The Feedback frame's shared parts (job 04, round 02-agenda-and-pages, `result.md` § The shared pieces;
// frame.md F120 to F145, F340 to F346): Rating, Absent, Tags, Waiting, Facts and Fact, KeepLines, Json,
// FilterBar and Seg, the table that stacks and a row's link. Presentational: values and hrefs come in as
// props; no part reads the address or fetches. They emit the boards' markup and the classes of
// src/sikstack/styles/feedback/frame.css; their words are `@/content/feedback-frame`, their formats
// `@/lib/feedback/format` and `@/lib/feedback/lang`. The pager is the Library's (`Pager` from
// `@/sikstack/library`, named `Feedback pages`). Each page's own parts live in `./list/`, `./item/` and
// `./agenda/`, each with its own index.
export { Absent, Rating, Tags, Waiting } from "./marks";
export { Fact, Facts, Json, KeepLines } from "./facts";
export {
  FilterBar,
  Seg,
  type FilterBarNames,
  type FilterBarProject,
  type FilterBarProps,
  type RatingFilter,
  type SegOption,
  type SegProps,
} from "./filter-bar";
export { ClampLink, StackTable, type StackTableProps } from "./stack-table";
