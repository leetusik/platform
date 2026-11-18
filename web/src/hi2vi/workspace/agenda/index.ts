// The Workspace's Agenda (design job 02, rounds 01-workspace and 02-agenda-and-links: `Agenda.dc.html`,
// `AgendaList.dc.html`, frame.md F301 to F303), at rest: its three parts, the add form, the rows with their Delete
// and its confirm, the open changes no row carries, its loading and failed parts. Words: `@/content/workspace/agenda`.
//
// - `AgendaList` (client): the list, holding what the page wrote over each read; `AddForm`, `AgendaConfirm` its
//   form and its confirm.
// - `AgendaFailed` (client): the part that failed, with Try again.
// - `AgendaLoading`, `PartHead`, `AgendaRow`, `LoadingRows`: the parts with no state of their own.
// - The pure model: `agendaParts`, `deferredPageFrom`, `deferredPlace`, `endedShown`, `emptyText`, `addIsPrimary`,
//   `agendaFrom`, `workspaceHrefs`, `workspaceProjectId`, `writeShown`.
export {
  AddForm,
  AgendaConfirm,
  AgendaFailed,
  AgendaList,
  type AgendaForm,
  type AgendaListProps,
  type AgendaPhase,
} from "./agenda-list";
export { AgendaLoading, AgendaRow, LoadingRows, PartHead } from "./parts";
export {
  addIsPrimary,
  AGENDA_PER,
  AGENDA_SHOWN,
  agendaFrom,
  agendaParts,
  deferredPageFrom,
  deferredPlace,
  emptyText,
  endedShown,
  workspaceHrefs,
  workspaceProjectId,
  writeShown,
  type AgendaPartKey,
  type AgendaParts,
  type AgendaRowModel,
  type DeferredPlace,
  type WriteShown,
} from "./model";
