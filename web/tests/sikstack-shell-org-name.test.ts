import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AppError from "@/app/(app)/error";
import { ShellOrgNameProvider } from "@/sikstack/shell";

// The error's "Back to <org name>" is server-rendered from the Shell's own name (S11): the first
// HTML of a server-side error never reads the placeholder `—`.
describe("the error state's org name", () => {
  it("comes from the Shell in the server render", () => {
    const html = renderToString(
      createElement(
        ShellOrgNameProvider,
        { name: "Acme Docs" },
        createElement(AppError, {
          error: Object.assign(new Error("x"), { digest: "123" }),
          reset: () => {},
        }),
      ),
    );
    expect(html).toContain("Back to Acme Docs");
    expect(html).not.toContain("Back to —");
  });
});
