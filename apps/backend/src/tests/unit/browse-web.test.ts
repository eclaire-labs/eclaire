import { describe, expect, it } from "vitest";
import {
  buildBrowseWebInvocation,
  getBrowseWebSessionName,
  validateBrowseWebUrl,
} from "../../lib/agent/tools/browse-web.js";

const context = {
  sessionId: "conv_123",
  requestId: "req_123",
};

describe("browseWeb helpers", () => {
  it("builds a stable session name from the conversation/session id", () => {
    expect(getBrowseWebSessionName(context)).toBe("eclaire-conv-123");
  });

  it("translates the open action to an agent-browser command", () => {
    const invocation = buildBrowseWebInvocation(
      {
        action: "open",
        url: "https://example.com/docs",
      },
      context,
    );

    expect(invocation.args).toContain("open");
    expect(invocation.args).toContain("https://example.com/docs");
    expect(invocation.args).toContain("--session");
    expect(invocation.args).toContain("eclaire-conv-123");
  });

  it("translates snapshot, wait, get, screenshot, and close actions", () => {
    expect(
      buildBrowseWebInvocation(
        { action: "snapshot", interactive: true, compact: true },
        context,
      ).args,
    ).toEqual(expect.arrayContaining(["snapshot", "-i", "-c"]));

    expect(
      buildBrowseWebInvocation(
        { action: "wait", waitType: "load", value: "networkidle" },
        context,
      ).args,
    ).toEqual(expect.arrayContaining(["wait", "--load", "networkidle"]));

    expect(
      buildBrowseWebInvocation({ action: "get", target: "title" }, context)
        .args,
    ).toEqual(expect.arrayContaining(["get", "title"]));

    const screenshotInvocation = buildBrowseWebInvocation(
      { action: "screenshot", fullPage: true },
      context,
    );
    expect(screenshotInvocation.args).toEqual(
      expect.arrayContaining(["screenshot", "--full"]),
    );
    expect(screenshotInvocation.screenshotPath).toMatch(/browse-.*\.png$/);

    expect(buildBrowseWebInvocation({ action: "close" }, context).args).toEqual(
      expect.arrayContaining(["close"]),
    );
  });

  it("rejects local and private-network URLs", () => {
    expect(() => validateBrowseWebUrl("file:///tmp/test.html")).toThrow(
      "browseWeb only allows http and https URLs.",
    );
    expect(() => validateBrowseWebUrl("http://localhost:3000")).toThrow(
      "browseWeb blocks local and private-network URLs.",
    );
    expect(() => validateBrowseWebUrl("http://192.168.1.8")).toThrow(
      "browseWeb blocks local and private-network URLs.",
    );
  });
});
