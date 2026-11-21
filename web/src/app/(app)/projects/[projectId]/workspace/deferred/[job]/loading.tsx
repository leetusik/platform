import { DeferredJobLoading } from "@/sikstack/workspace/deferred/loading";

/** One deferred job while it loads (`DeferredJob.dc.html`, Loading): it reads nothing. */
export default function WorkspaceJobLoading() {
  return <DeferredJobLoading />;
}
