import { plural } from "@/lib/format";

import {
  WS_ACTIONS,
  WS_CHANGE,
  WS_GLOSSARY,
  WS_PAGER,
  WS_STATES,
} from "./frame";

/**
 * The Agenda's words (design job 02, rounds 01-workspace and 02-agenda-and-links: `AgendaList.dc.html`, frame.md
 * F36, F45, F49, F78, F301 to F303), verbatim. Imported by path (`@/content/workspace/agenda`). What the frame
 * already says (the heads, the actions, a change that waits, the part that failed, the pager's name) is taken from
 * `./frame`, never retyped.
 */
export const AGENDA = {
  heads: {
    open: WS_GLOSSARY.heads.openAndInProgress,
    deferred: WS_GLOSSARY.heads.deferred,
    ended: WS_GLOSSARY.heads.solvedAndDropped,
  },
  /** A part's count: `5 items`, `1 item`, `0 items`. */
  count: (n: number): string => plural(n, "item"),
  addItem: WS_ACTIONS.addItem,
  form: {
    title: WS_ACTIONS.title,
    titlePlaceholder: "e.g. Sign-in emails land in spam",
    note: WS_ACTIONS.note,
    cancel: WS_ACTIONS.cancel,
    add: WS_ACTIONS.add,
    titleError: WS_CHANGE.titleError,
    failed: WS_CHANGE.addFailed,
  },
  /** The list's status line (`role="status"`). */
  said: {
    added: (title: string): string =>
      `“${title}” added. It waits for the next sync.`,
    deleted: (title: string): string =>
      `“${title}” deleted. It leaves the workspace at the next sync.`,
    deletedMany: (n: number): string =>
      `${n} items deleted. They leave the workspace at the next sync.`,
  },
  empty: {
    none: "No items yet. Add what you want done or dealt with, at any size.",
    noOpen: "No open items. Add what you want done or dealt with next.",
  },
  failed: WS_STATES.partFailed.agenda,
  retry: WS_STATES.retry,
  loading: "Loading…",
  row: {
    delete: WS_ACTIONS.delete[0],
    /** The row's Delete, named for its item (F302). */
    deleteLabel: (title: string): string => `Delete: ${title}`,
  },
  /** Delete asks first (F303), naming what it acts on. */
  confirmDelete: {
    title: (title: string): string => `Delete “${title}”?`,
    /** The title in the dialog's `h2`, around the item's own title (its `lang` kept). */
    before: "Delete “",
    after: "”?",
    titleMany: (n: number): string => `Delete ${n} items?`,
    text: "It leaves the agenda for good, with its note. Its phases and deferred jobs stay. You cannot undo this.",
    textMany:
      "They leave the agenda for good, with their notes. Their phases and deferred jobs stay. You cannot undo this.",
    cancel: WS_ACTIONS.cancel,
    yes: ["Yes, delete", WS_ACTIONS.delete[1]] as const,
    /** F4's sentence for a send that did not get an answer (F45's pattern; listed for the walk). */
    failed: "Could not delete the item. Try again.",
  },
  pager: WS_PAGER.deferredItems,
  showAll: WS_GLOSSARY.buttons.showAll,
} as const;
