import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const browserRuntimeMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
  listTabs: vi.fn(),
}));

vi.mock("../../middleware/with-auth.js", () => ({
  withAuth:
    (handler: (c: unknown, userId: string, principal: unknown) => unknown) =>
    async (c: unknown) =>
      handler(c, "user_123", {
        actorId: "user_123",
        actorKind: "human",
        ownerUserId: "user_123",
        grantId: null,
        grantedByActorId: null,
        credentialId: null,
        authMethod: "session",
        scopes: ["*"],
      }),
}));

vi.mock("../../lib/auth-utils.js", () => ({
  assertInstanceAdmin: vi.fn(),
}));

vi.mock("../../lib/browser/index.js", () => ({
  browserRuntime: browserRuntimeMock,
}));

import { browserRoutes } from "../../routes/browser.js";

describe("browser routes", () => {
  const app = new Hono();
  app.route("/api/browser", browserRoutes);

  beforeEach(() => {
    browserRuntimeMock.getStatus.mockReset();
    browserRuntimeMock.attach.mockReset();
    browserRuntimeMock.detach.mockReset();
    browserRuntimeMock.listTabs.mockReset();
  });

  it("returns browser status", async () => {
    browserRuntimeMock.getStatus.mockReturnValue({
      enabled: true,
      available: true,
      state: "connected",
      profile: {
        name: "user",
        label: "My Chrome Session",
        driver: "existing-session",
        transport: "chrome-mcp",
        attachOnly: true,
      },
      transport: "chrome-mcp",
      capabilities: {
        interactive: true,
        authenticatedSession: true,
        localOnly: true,
        screenshot: true,
        tabSelection: true,
      },
      tabCount: 2,
      activeTab: null,
      lastError: null,
    });

    const response = await app.request("http://localhost/api/browser/status");

    expect(response.status).toBe(200);
    expect(browserRuntimeMock.getStatus).toHaveBeenCalledWith(
      "browser-settings",
    );
    await expect(response.json()).resolves.toMatchObject({
      state: "connected",
      tabCount: 2,
    });
  });

  it("lists tabs", async () => {
    browserRuntimeMock.listTabs.mockResolvedValue([
      {
        id: "1",
        pageIdx: 1,
        title: "Inbox",
        url: "https://mail.example.com",
        selected: true,
      },
    ]);

    const response = await app.request("http://localhost/api/browser/tabs");

    expect(response.status).toBe(200);
    expect(browserRuntimeMock.listTabs).toHaveBeenCalledWith({
      requestId: "browser-settings",
    });
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: "1",
          pageIdx: 1,
          title: "Inbox",
          url: "https://mail.example.com",
          selected: true,
        },
      ],
    });
  });
});
