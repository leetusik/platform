import { Trend, Usage } from "@/hi2vi/frame";
import { Grid } from "@/hi2vi/ui";
import { requireIdentity } from "@/lib/auth-guards";

import { FeedbackPanel, LibraryPanel, WorkspacePanel } from "./parts";
import { ProjectHeadLoading } from "./project-head";
import { ProjectKeysLoading } from "./project-keys";

import "./project-home.css";

// Project home while it loads (`ProjectHome.dc.html`, Loading): every part keeps its head. The back
// link reads the org (the session read is per-request cached; the layout already made it); the `h1`
// holds a 7em skeleton; Workspace is its signed empty form (operator D1: no workspace data, so no
// loading form); Library is its first load (no count); Feedback, Usage, Trend and the keys load.
export default async function ProjectHomeLoading() {
  const { identity } = await requireIdentity();
  const org = identity.tenant?.name ?? "—";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="column">
      <ProjectHeadLoading org={org} />
      <WorkspacePanel />
      <Grid min="26em">
        <LibraryPanel count={null} state={{ kind: "first-load" }} />
        <FeedbackPanel projectId="" rows={null} />
      </Grid>
      <div className="section">
        <Usage loading />
        <Trend
          series={[]}
          lastDay={today}
          loading
          format={{ timeZone: "UTC" }}
        />
      </div>
      <ProjectKeysLoading />
    </div>
  );
}
