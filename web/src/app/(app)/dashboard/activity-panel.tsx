import { ORG_HOME } from "@/content/dashboard";
import { Block, BlockText, Panel, PanelHead } from "@/sikstack/ui";

import { ACTIVITY_ROW_STYLE } from "./org-home-loading";
import type { ActivityLineView } from "./org-home-model";

/**
 * Recent activity (`OrgHomeActivity.dc.html`): the sentence with the name in `.strong`, the time at the
 * row's end; newest first, seven lines; the empty block. Its Loading is `ActivityLoading`.
 */
export function ActivityPanel({
  lines,
}: {
  lines: readonly ActivityLineView[];
}) {
  const A = ORG_HOME.activity;
  return (
    <Panel aria-label={A.heading}>
      <PanelHead>
        <h2>{A.heading}</h2>
      </PanelHead>
      {lines.length > 0 ? (
        <ul>
          {lines.map((line) => (
            <li key={line.key} className="row" style={ACTIVITY_ROW_STYLE}>
              <span style={{ overflowWrap: "anywhere" }}>
                {line.text}{" "}
                <span className="strong" lang={line.lang}>
                  {line.name}
                </span>
              </span>
              <span className="dim nowrap">{line.when}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Block className="panel-body has-rule">
          <BlockText>{A.empty}</BlockText>
        </Block>
      )}
    </Panel>
  );
}
