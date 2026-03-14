import { describe, expect, it, vi } from "vitest";

const browserRuntimeMock = vi.hoisted(() => ({
  getToolAvailability: vi.fn(() => ({
    availability: "setup_required" as const,
    availabilityReason:
      "Install the chrome-devtools-mcp binary to enable this tool.",
  })),
}));

vi.mock("../../lib/browser/index.js", () => ({
  browserRuntime: browserRuntimeMock,
}));

import { getAgentCatalog } from "../../lib/services/agents.js";

describe("agent catalog browser metadata", () => {
  it("adds availability metadata for browseChrome", () => {
    const catalog = getAgentCatalog();
    const browseChrome = catalog.tools.find(
      (tool) => tool.name === "browseChrome",
    );

    expect(browseChrome).toMatchObject({
      name: "browseChrome",
      availability: "setup_required",
      availabilityReason:
        "Install the chrome-devtools-mcp binary to enable this tool.",
    });
  });
});
