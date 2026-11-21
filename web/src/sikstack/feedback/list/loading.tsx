"use client";

import { useParams } from "next/navigation";

import { AT_REST } from "@/lib/feedback/place";

import { FeedbackListView } from "./view";

/**
 * The list while the page itself loads (`FeedbackListStates.dc.html`, Loading; F128, F141, F343): the
 * head with the count line as a bar, the bar disabled, eight skeleton rows under the column heads. A
 * route's `loading.tsx` has no params, so the scope is read from the address (`[projectId]`): with a
 * project picked the select and the Project column are left out. It reads nothing.
 */
export function FeedbackListLoading() {
  const params = useParams<{ projectId?: string | string[] }>();
  const id = params?.projectId;
  const scope = (Array.isArray(id) ? id[0] : id) || null;
  return (
    <FeedbackListView
      scope={scope}
      place={AT_REST}
      projects={[]}
      rows={[]}
      total={0}
      phase="loading"
    />
  );
}
