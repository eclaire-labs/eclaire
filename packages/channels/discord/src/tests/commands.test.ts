import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSession,
  handleCommandInteraction,
  resetSessions,
} from "../commands.js";
import { setDeps } from "../deps.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockCreateSession = vi.fn(async () => ({
  id: "session-1",
  title: "New session",
}));
type SessionItem = {
  id: string;
  title: string | null;
  messageCount: number;
  updatedAt: Date;
};
const mockListSessions = vi.fn(async (): Promise<SessionItem[]> => []);
const mockDeleteSession = vi.fn(async () => true);
const mockGetModelInfo = vi.fn(
  (): { name: string; provider: string; model: string } | null => ({
    name: "Claude Sonnet",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  }),
);

function makeInteraction(commandName: string) {
  return {
    commandName,
    deferred: false,
    deferReply: vi.fn(async function (this: { deferred: boolean }) {
      this.deferred = true;
    }),
    editReply: vi.fn(async (_content: string) => ({})),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSessions();
  setDeps({
    findChannel: vi.fn(),
    findChannelById: vi.fn(),
    findActiveChannels: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    processPromptRequest: vi.fn(),
    recordHistory: vi.fn(),
    logger: mockLogger,
    createSession: mockCreateSession,
    listSessions: mockListSessions,
    deleteSession: mockDeleteSession,
    getModelInfo: mockGetModelInfo,
  });
});

describe("getSession", () => {
  it("returns a new session with enableThinking true", () => {
    const session = getSession("ch-1");
    expect(session.enableThinking).toBe(true);
    expect(session.sessionId).toBeUndefined();
  });

  it("returns the same object on repeat call", () => {
    const s1 = getSession("ch-1");
    const s2 = getSession("ch-1");
    expect(s1).toBe(s2);
  });

  it("returns separate sessions per channelId", () => {
    const s1 = getSession("ch-1");
    const s2 = getSession("ch-2");
    expect(s1).not.toBe(s2);
  });
});

describe("handleCommandInteraction", () => {
  it("returns false for unknown command", async () => {
    const interaction = makeInteraction("unknown-command");
    const result = await handleCommandInteraction(
      interaction as any,
      "ch-1",
      "user-1",
    );
    expect(result).toBe(false);
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it("defers reply as ephemeral for known commands", async () => {
    const interaction = makeInteraction("eclaire-help");
    await handleCommandInteraction(interaction as any, "ch-1", "user-1");
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });

  describe("/eclaire-help", () => {
    it("lists all available commands", async () => {
      const interaction = makeInteraction("eclaire-help");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("eclaire-help");
      expect(reply).toContain("eclaire-new");
      expect(reply).toContain("eclaire-model");
      expect(reply).toContain("eclaire-history");
      expect(reply).toContain("eclaire-settings");
      expect(reply).toContain("eclaire-clear");
    });
  });

  describe("/eclaire-new", () => {
    it("creates a new session", async () => {
      const interaction = makeInteraction("eclaire-new");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      expect(mockCreateSession).toHaveBeenCalledWith("user-1");
      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("New conversation started");
      expect(getSession("ch-1").sessionId).toBe("session-1");
    });

    it("replies with unavailable when createSession is not provided", async () => {
      setDeps({
        findChannel: vi.fn(),
        findChannelById: vi.fn(),
        findActiveChannels: vi.fn(),
        encrypt: vi.fn(),
        decrypt: vi.fn(),
        processPromptRequest: vi.fn(),
        recordHistory: vi.fn(),
        logger: mockLogger,
      });

      const interaction = makeInteraction("eclaire-new");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("not available");
    });

    it("replies with error when createSession throws", async () => {
      mockCreateSession.mockRejectedValueOnce(new Error("DB error"));

      const interaction = makeInteraction("eclaire-new");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("Failed");
    });
  });

  describe("/eclaire-model", () => {
    it("shows model info", async () => {
      const interaction = makeInteraction("eclaire-model");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("Claude Sonnet");
      expect(reply).toContain("anthropic");
    });

    it("replies when getModelInfo is not provided", async () => {
      setDeps({
        findChannel: vi.fn(),
        findChannelById: vi.fn(),
        findActiveChannels: vi.fn(),
        encrypt: vi.fn(),
        decrypt: vi.fn(),
        processPromptRequest: vi.fn(),
        recordHistory: vi.fn(),
        logger: mockLogger,
      });

      const interaction = makeInteraction("eclaire-model");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("not available");
    });

    it("replies when model is not configured", async () => {
      mockGetModelInfo.mockReturnValueOnce(null);

      const interaction = makeInteraction("eclaire-model");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("No model is currently configured");
    });
  });

  describe("/eclaire-history", () => {
    it("formats session list", async () => {
      mockListSessions.mockResolvedValueOnce([
        {
          id: "s1",
          title: "Chat about TypeScript",
          messageCount: 5,
          updatedAt: new Date(),
        },
        {
          id: "s2",
          title: "Debug session",
          messageCount: 12,
          updatedAt: new Date(),
        },
      ]);

      const interaction = makeInteraction("eclaire-history");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      expect(mockListSessions).toHaveBeenCalledWith("user-1", 10);
      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("1. Chat about TypeScript (5 msgs)");
      expect(reply).toContain("2. Debug session (12 msgs)");
    });

    it("truncates long titles at 40 characters", async () => {
      mockListSessions.mockResolvedValueOnce([
        {
          id: "s1",
          title:
            "This is a very long conversation title that should be truncated",
          messageCount: 3,
          updatedAt: new Date(),
        },
      ]);

      const interaction = makeInteraction("eclaire-history");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("This is a very long conversation titl...");
    });

    it("replies with 'No conversations found' for empty list", async () => {
      mockListSessions.mockResolvedValueOnce([]);

      const interaction = makeInteraction("eclaire-history");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("No conversations found");
    });
  });

  describe("/eclaire-settings", () => {
    it("toggles thinking mode off then on", async () => {
      const interaction1 = makeInteraction("eclaire-settings");
      await handleCommandInteraction(interaction1 as any, "ch-1", "user-1");

      expect(getSession("ch-1").enableThinking).toBe(false);
      const reply1 = interaction1.editReply.mock.calls[0]?.[0] as string;
      expect(reply1).toContain("OFF");

      const interaction2 = makeInteraction("eclaire-settings");
      await handleCommandInteraction(interaction2 as any, "ch-1", "user-1");

      expect(getSession("ch-1").enableThinking).toBe(true);
      const reply2 = interaction2.editReply.mock.calls[0]?.[0] as string;
      expect(reply2).toContain("ON");
    });
  });

  describe("/eclaire-clear", () => {
    it("deletes old session and creates new one", async () => {
      // Set up existing session
      getSession("ch-1").sessionId = "old-session";

      mockCreateSession.mockResolvedValueOnce({
        id: "new-session",
        title: "Fresh",
      });

      const interaction = makeInteraction("eclaire-clear");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      expect(mockDeleteSession).toHaveBeenCalledWith("old-session", "user-1");
      expect(mockCreateSession).toHaveBeenCalledWith("user-1");
      expect(getSession("ch-1").sessionId).toBe("new-session");
      const reply = interaction.editReply.mock.calls[0]?.[0] as string;
      expect(reply).toContain("cleared");
    });

    it("works without existing session", async () => {
      mockCreateSession.mockResolvedValueOnce({
        id: "fresh-session",
        title: "New",
      });

      const interaction = makeInteraction("eclaire-clear");
      await handleCommandInteraction(interaction as any, "ch-1", "user-1");

      expect(mockDeleteSession).not.toHaveBeenCalled();
      expect(getSession("ch-1").sessionId).toBe("fresh-session");
    });
  });

  it("catches handler errors and replies with generic message", async () => {
    mockCreateSession.mockRejectedValueOnce(new Error("unexpected"));

    const interaction = makeInteraction("eclaire-new");
    const result = await handleCommandInteraction(
      interaction as any,
      "ch-1",
      "user-1",
    );

    expect(result).toBe(true);
    // The command handler's own catch block handles this
    const reply = interaction.editReply.mock.calls[0]?.[0] as string;
    expect(reply).toContain("Failed");
  });
});
