import { describe, expect, it, vi } from "vitest";

const mcpRegistryMock = vi.hoisted(() => ({
  getMcpTools: vi.fn(() => ({})),
  getToolAvailability: vi.fn((toolName: string) => {
    if (toolName === "browseChrome") {
      return {
        availability: "setup_required" as const,
        availabilityReason:
          'Install "chrome-devtools-mcp" to enable this server.',
      };
    }
    return undefined;
  }),
  getServerAvailability: vi.fn(() => ({
    availability: "setup_required" as const,
    availabilityReason: 'Install "chrome-devtools-mcp" to enable this server.',
  })),
  isMcpTool: vi.fn((name: string) => name === "browseChrome"),
  getConnection: vi.fn(),
  getServerConfig: vi.fn(),
  getServerKeyForTool: vi.fn((name: string) =>
    name === "browseChrome" ? "chrome-devtools" : undefined,
  ),
}));

vi.mock("../../lib/mcp/index.js", () => ({
  getMcpRegistry: () => mcpRegistryMock,
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
        'Install "chrome-devtools-mcp" to enable this server.',
    });
  });
});
