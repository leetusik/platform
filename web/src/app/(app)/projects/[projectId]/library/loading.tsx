import { ProjectLoading } from "./parts";

/**
 * A project's library while it loads (`ProjectLibrary.dc.html`, Loading): the way back stands, the
 * name and the count are bars; Continue reading's lead, one book row and the table's eight rows as
 * skeletons. It reads nothing.
 */
export default function ProjectLibraryLoading() {
  return <ProjectLoading viewer="member" />;
}
