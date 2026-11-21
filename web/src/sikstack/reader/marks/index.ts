// Highlights, notes and bookmarks in the Library's reader (P63-fk.S11; job 03, Library round 02: `## Build` § Page:
// annotations). The layer itself stays `@/components/reader/annotations` (`look="library"`), the one state machine
// both looks share; this folder is what the Library's look draws with:
// - `./parts`: the signed parts (the bar a selection shows, the box, the notes beside the text, the bottom slot's
//   place bar and lines, the Notes sheet's body and count);
// - `./model`: what they say and where they sit, as pure functions (the paint's classes, the titles, the count line,
//   a row's place, the margin's fit);
// - `./wire`: every write's payload, built here for both looks (the persisted data does not move);
// - `./undo`: the undo line's clock (ten seconds, then sent; sent on leaving).
// Words: `@/content/reader-marks`; the sheet is `styles/library/annotations.css`.
export * from "./model";
export * from "./parts";
export * from "./undo";
export * from "./wire";
