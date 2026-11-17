import type { Metadata } from "next";

import { DASHBOARD } from "@/content/dashboard";
import { Keys, Trend, Usage } from "@/hi2vi/frame";
import { Grid, Stack } from "@/hi2vi/ui";
import { requireIdentity } from "@/lib/auth-guards";
import type { FormatOptions } from "@/lib/format";
import {
  getDashboard,
  getDocuments,
  getUsage,
  listOrgCredentials,
} from "@/lib/knowledge/app";

import { ActivityPanel } from "./activity-panel";
import { HashLanding } from "./hash-landing";
import {
  createOrgProject,
  mintOrgKey,
  revokeOrgKey,
  saveOrgSlug,
} from "./actions";
import "./org-home.css";
import {
  activityLines,
  keyRow,
  ORG_KEYS_HEAD_ID,
  projectRows,
} from "./org-home-model";
import { ProjectsPanel } from "./projects-panel";
import { UrlPanel } from "./url-panel";

/**
 * Org home (job 01 round 03-instrument, `OrgHome.dc.html`): a system page inside the Shell, in the
 * signed order: the org's name; the read-out in two groups; Projects; Trend with Public URL beside
 * Recent activity; Org API keys. The toast region is the Shell's (`publishToast`).
 *
 * Reads, in parallel: `/app/usage` (the 30-day figures and the trend), `/app/credentials` (the org's
 * keys, and their lines in the feed), `/app/documents` (`total`: Active total, the documents the org
 * holds now), and the Projects panel's own: `/app/dashboard` (the rows and the project feed) with one
 * `/app/documents?project=<id>` a project for its Documents column. A failure of the Projects reads
 * is that panel's own state (Projects did not load.); any other failure is the route's error page.
 */
export const metadata: Metadata = { title: DASHBOARD.title };

interface ProjectsData {
  dashboard: Awaited<ReturnType<typeof getDashboard>>;
  docs: Map<string, number>;
}

async function readProjects(token: string): Promise<ProjectsData | null> {
  try {
    const dashboard = await getDashboard(token);
    const counts = await Promise.all(
      dashboard.projects.map(
        async (p) =>
          [
            p.id,
            (await getDocuments(token, { project: p.id, limit: 1 })).total,
          ] as const,
      ),
    );
    return { dashboard, docs: new Map(counts) };
  } catch {
    return null;
  }
}

/** One `now` and one zone for every date on the page, server and client alike (no hydration drift). */
function pageFormat(): FormatOptions {
  return {
    now: Date.now(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** Today's calendar date in the zone the page formats in. */
function today(format: FormatOptions): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: format.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(format.now);
}

export default async function DashboardPage() {
  const { token, identity } = await requireIdentity();
  const orgName = identity.tenant?.name ?? "";
  const slug = identity.tenant?.slug ?? null;
  const format = pageFormat();

  const [usage, orgKeys, held, projects] = await Promise.all([
    getUsage(token),
    listOrgCredentials(token),
    getDocuments(token, { limit: 1 }),
    readProjects(token),
  ]);

  const series = usage.daily_counts.map((day) => day.searches);
  const lastDay = usage.daily_counts.at(-1)?.day ?? today(format);

  return (
    <div className="column">
      <header className="page-top">
        <div className="page-head">
          <div className="page-title">
            <h1>{orgName}</h1>
          </div>
        </div>
      </header>
      <Usage
        figures={{
          docs30: usage.totals.documents_created,
          searches30: usage.totals.searches,
          deleted30: usage.totals.documents_deleted,
          docs: held.total,
        }}
      />
      <ProjectsPanel
        rows={
          projects
            ? projectRows(projects.dashboard.projects, projects.docs, format)
            : null
        }
        create={createOrgProject}
      />
      <Grid className="orghome-pair">
        <Stack gap={5}>
          <Trend series={series} lastDay={lastDay} format={format} />
          <UrlPanel slug={slug} save={saveOrgSlug} />
        </Stack>
        <ActivityPanel
          lines={activityLines(
            projects?.dashboard.activity ?? [],
            orgKeys,
            format,
          )}
        />
      </Grid>
      <Keys
        scope="org"
        subject={orgName}
        rows={orgKeys.map(keyRow)}
        mint={mintOrgKey}
        revoke={revokeOrgKey}
        format={format}
        headId={ORG_KEYS_HEAD_ID}
      />
      <HashLanding id={ORG_KEYS_HEAD_ID} />
    </div>
  );
}
