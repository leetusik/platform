// Add to agenda and the Agenda part (job 04 round 02, `FeedbackItemSend*`, `FeedbackItemAgenda*`,
// `Waiting`; frame.md F143, F341 to F344; operator decision 2). The record's state comes from the
// agenda seam (`@/lib/feedback/agenda`: `canAdd`, `sent`), read in `../item/body.tsx`, the one place
// they are mounted (the item's `headEnd` and `agenda` slots).
//
// - `AgendaPart`, `AddedToAgenda` (`./part`): the Agenda part and the head's end once added,
//   presentational, rendered on the server for a record not offered or already added.
// - `AgendaScope`, `AgendaHeadEnd`, `AgendaSlot` (`./control`, client): the add's island, mounted only
//   when `canAdd` offers the add (never today).
// - `./model`: the rules, pure.
//
// Its sheet is `src/hi2vi/styles/feedback/agenda.css`; its words `@/content/feedback-agenda`.
export { AddedToAgenda, AgendaPart, type AgendaPartState } from "./part";
export {
  AgendaHeadEnd,
  AgendaScope,
  AgendaSlot,
  type AgendaScopeProps,
} from "./control";
export {
  agendaPageState,
  answer,
  ask,
  cancel,
  focusBack,
  isLocked,
  isOpen,
  send,
  type AddPhase,
  type AgendaPageState,
} from "./model";
