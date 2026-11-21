import { BacklogLoading } from "@/sikstack/workspace/backlog";

/** The backlog while it loads: `WsNav` with the sync line as a bar, Now and Phases as skeletons. Reads nothing. */
export default function WorkspaceBacklogLoading() {
  return <BacklogLoading />;
}
