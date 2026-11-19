import { cookies, headers } from "next/headers";

import { Trend, Usage } from "@/hi2vi/frame";
import { Grid } from "@/hi2vi/ui";
import { requireIdentity } from "@/lib/auth-guards";
import { REQUEST_PATH_HEADER } from "@/lib/next-path";

import {
  projectHomeFormat,
  projectHomeId,
  requestOrigin,
  todayIn,
} from "./model";
import { FeedbackPanel, LibraryPanel, WorkspacePanel } from "./parts";
import { ProjectHeadLoading } from "./project-head";
import { ProjectKeysLoading } from "./project-keys";

import "./project-home.css";

// Project home while it loads (`ProjectHome.dc.html`, Loading): every part keeps its head. The back
// link reads the org (the session read is per-request cached; the layout already made it); the `h1`
// holds a 7em skeleton; Workspace is its signed empty form with the link command (operator D1: no
// workspace data, so no loading form; the id comes from the request's path, as loading gets no params); Library is its first load (no count); Feedback, Usage, Trend and the keys load.
export default async function ProjectHomeLoading() {
  const { identity } = await requireIdentity();
  const org = identity.tenant?.name ?? "—";
  const format = projectHomeFormat(await cookies());
  const request = await headers();
  const origin = requestOrigin(request);
  const projectId = projectHomeId(request.get(REQUEST_PATH_HEADER));
  return (
    <div className="column">
      <ProjectHeadLoading org={org} />
      <WorkspacePanel origin={origin} projectId={projectId} />
      <Grid min="26em">
        <LibraryPanel count={null} state={{ kind: "first-load" }} />
        <FeedbackPanel projectId="" rows={null} />
      </Grid>
      <div className="section">
        <Usage loading />
        <Trend series={[]} lastDay={todayIn(format)} loading format={format} />
      </div>
      <ProjectKeysLoading />
    </div>
  );
}
