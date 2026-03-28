/**
 * Integration tests for prompt service scope-based tool filtering.
 *
 * Verifies that API key scopes correctly restrict which tools are available
 * to the agent during real prompt execution via the session message API.
 *
 * Requires a running server at BASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreamEvent {
  type:
    | "thought"
    | "tool-call"
    | "text-chunk"
    | "error"
    | "done"
    | "approval-required"
    | "approval-resolved";
  timestamp?: string;
  content?: string;
  name?: string;
  id?: string;
  status?: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminFetch = createAuthenticatedFetch(TEST_API_KEY);

const createdKeyIds: { actorId: string; keyId: string }[] = [];
const createdSessionIds: string[] = [];
const createdNoteIds: string[] = [];

/** Create an API key with given permission levels and track for cleanup. */
async function createTestKey(
  dataAccess: string,
  adminAccess: string,
): Promise<string> {
  const actorsRes = await adminFetch(`${BASE_URL}/actors`);
  const { items: actors } = (await actorsRes.json()) as {
    items: { id: string; kind: string }[];
  };
  const humanActor = actors.find((a) => a.kind === "human");
  if (!humanActor) throw new Error("No human actor found");

  const res = await adminFetch(`${BASE_URL}/actors/${humanActor.id}/api-keys`, {
    method: "POST",
    body: JSON.stringify({
      name: `prompt-svc-test-${dataAccess}-${adminAccess}-${Date.now()}`,
      dataAccess,
      adminAccess,
    }),
  });

  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string; key: string };
  createdKeyIds.push({ actorId: humanActor.id, keyId: body.id });
  return body.key;
}

/** Parse SSE stream into typed events. */
async function parseSSEStream(response: Response): Promise<StreamEvent[]> {
  if (!response.body) {
    throw new Error("No response body available for streaming");
  }

  const events: StreamEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data.trim() === "") continue;
          try {
            const event = JSON.parse(data) as StreamEvent;
            events.push(event);
            if (event.type === "done") return events;
          } catch {
            // skip malformed events
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}

/** Create a session using the given fetch function and track for cleanup. */
async function createTestSession(
  fetchFn: ReturnType<typeof createAuthenticatedFetch>,
): Promise<string> {
  const res = await fetchFn(`${BASE_URL}/sessions`, {
    method: "POST",
    body: JSON.stringify({ title: `prompt-svc-test-${Date.now()}` }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  createdSessionIds.push(body.id);
  return body.id;
}

/** Send a message to a session and return parsed SSE events. */
async function sendMessage(
  fetchFn: ReturnType<typeof createAuthenticatedFetch>,
  sessionId: string,
  prompt: string,
): Promise<StreamEvent[]> {
  const res = await fetchFn(`${BASE_URL}/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  return parseSSEStream(res);
}

/** Concatenate all text-chunk content. */
function getTextFromEvents(events: StreamEvent[]): string {
  return events
    .filter((e) => e.type === "text-chunk")
    .map((e) => e.content || "")
    .join("");
}

/** Get all tool-call events. */
function getToolCallEvents(events: StreamEvent[]): StreamEvent[] {
  return events.filter((e) => e.type === "tool-call");
}

/** Get the done event. */
function getDoneEvent(events: StreamEvent[]): StreamEvent | undefined {
  return events.find((e) => e.type === "done");
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupTestKeys() {
  for (const { actorId, keyId } of createdKeyIds) {
    try {
      await adminFetch(`${BASE_URL}/actors/${actorId}/api-keys/${keyId}`, {
        method: "DELETE",
      });
    } catch {
      // best-effort
    }
  }
}

async function cleanupSessions() {
  for (const id of createdSessionIds) {
    try {
      await adminFetch(`${BASE_URL}/sessions/${id}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
}

async function cleanupNotes() {
  for (const id of createdNoteIds) {
    try {
      await adminFetch(`${BASE_URL}/notes/${id}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Prompt Service Integration Tests", { timeout: 120_000 }, () => {
  let readOnlyKey: string;
  let readWriteKey: string;

  beforeAll(async () => {
    readOnlyKey = await createTestKey("read", "none");
    readWriteKey = await createTestKey("read_write", "none");
  }, 30_000);

  afterAll(async () => {
    await cleanupNotes();
    await cleanupSessions();
    await cleanupTestKeys();
  });

  // -------------------------------------------------------------------------
  // Suite 1: Tool filtering with scoped API keys
  // -------------------------------------------------------------------------

  describe("tool filtering with scoped API keys", () => {
    it("read-only key cannot use write tools", async () => {
      // Create session with admin key (requires conversations:write)
      const sessionId = await createTestSession(adminFetch);
      await delay(200);

      // Send message with read-only key asking to create a note
      const readOnlyFetch = createAuthenticatedFetch(readOnlyKey);
      const events = await sendMessage(
        readOnlyFetch,
        sessionId,
        "Use the createNote tool to create a note with the title 'Scope Test Read Only' and content 'this should not be created'.",
      );

      // The agent should NOT have called createNote (it's a write tool)
      const toolCalls = getToolCallEvents(events);
      const writeToolNames = toolCalls
        .filter((e) => e.status === "starting" || e.status === "completed")
        .map((e) => e.name);

      const writeTools = [
        "createNote",
        "updateNote",
        "deleteNote",
        "createBookmark",
        "createTask",
      ];
      for (const tool of writeTools) {
        expect(writeToolNames).not.toContain(tool);
      }

      // Should have a text response (the AI explains it can't write)
      const text = getTextFromEvents(events);
      expect(text.length).toBeGreaterThan(0);

      // Done event should be present
      const done = getDoneEvent(events);
      expect(done).toBeDefined();
    });

    it("read-write key can use write tools", async () => {
      const sessionId = await createTestSession(adminFetch);
      await delay(200);

      const readWriteFetch = createAuthenticatedFetch(readWriteKey);
      const events = await sendMessage(
        readWriteFetch,
        sessionId,
        "Use the createNote tool right now. Create a note with the title 'Integration Write Test' and content 'created by scoped key test'. Do not ask for confirmation.",
      );

      const toolCalls = getToolCallEvents(events);
      const completedCalls = toolCalls.filter(
        (e) => e.status === "completed" && e.name === "createNote",
      );
      expect(completedCalls.length).toBeGreaterThanOrEqual(1);

      // Track created note for cleanup
      const text = getTextFromEvents(events);
      const noteIdMatch = text.match(/note-[A-Za-z0-9]+/);
      if (noteIdMatch) {
        createdNoteIds.push(noteIdMatch[0]);
      }

      const done = getDoneEvent(events);
      expect(done).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Suite 3: Conversation persistence under scope boundaries
  // -------------------------------------------------------------------------

  describe("conversation persistence under scope boundaries", () => {
    let sharedSessionId: string;

    it("write with full-access key succeeds", async () => {
      sharedSessionId = await createTestSession(adminFetch);
      await delay(200);

      const events = await sendMessage(
        adminFetch,
        sharedSessionId,
        "Use the createNote tool right now. Create a note titled 'Boundary Test Note' with content 'scope boundary test'. Do not ask for confirmation.",
      );

      const toolCalls = getToolCallEvents(events);
      const completedCalls = toolCalls.filter(
        (e) => e.status === "completed" && e.name === "createNote",
      );
      expect(completedCalls.length).toBeGreaterThanOrEqual(1);

      // Track for cleanup
      const text = getTextFromEvents(events);
      const noteIdMatch = text.match(/note-[A-Za-z0-9]+/);
      if (noteIdMatch) {
        createdNoteIds.push(noteIdMatch[0]);
      }
    });

    it("read-only key in same session cannot write but history loads", async () => {
      expect(sharedSessionId).toBeDefined();
      await delay(500);

      const readOnlyFetch = createAuthenticatedFetch(readOnlyKey);
      const events = await sendMessage(
        readOnlyFetch,
        sharedSessionId,
        "What note did you just create in the previous message? Please tell me its title.",
      );

      // Should NOT have any write tool calls
      const toolCalls = getToolCallEvents(events);
      const writeToolCalls = toolCalls.filter((e) =>
        ["createNote", "updateNote", "deleteNote"].includes(e.name ?? ""),
      );
      expect(writeToolCalls).toHaveLength(0);

      // The response should reference the previously created note,
      // proving conversation history loaded correctly
      const text = getTextFromEvents(events).toLowerCase();
      expect(text).toContain("boundary test note");

      const done = getDoneEvent(events);
      expect(done).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Suite 4: Event transformation in real streaming
  // -------------------------------------------------------------------------

  describe("streaming event structure", () => {
    let streamEvents: StreamEvent[];

    it("produces correct tool-call lifecycle events", async () => {
      const sessionId = await createTestSession(adminFetch);
      await delay(200);

      streamEvents = await sendMessage(
        adminFetch,
        sessionId,
        "Search for notes using the findContent tool. Look for any content.",
      );

      const toolCalls = getToolCallEvents(streamEvents);

      // Should have at least one tool call with the full lifecycle
      expect(toolCalls.length).toBeGreaterThan(0);

      const startingEvents = toolCalls.filter((e) => e.status === "starting");
      const executingEvents = toolCalls.filter((e) => e.status === "executing");
      const completedEvents = toolCalls.filter((e) => e.status === "completed");

      expect(startingEvents.length).toBeGreaterThanOrEqual(1);
      expect(executingEvents.length).toBeGreaterThanOrEqual(1);
      expect(completedEvents.length).toBeGreaterThanOrEqual(1);

      // Each tool-call event should have a name and timestamp
      for (const tc of toolCalls) {
        expect(tc.name).toBeTypeOf("string");
        expect(tc.name!.length).toBeGreaterThan(0);
        expect(tc.timestamp).toBeTypeOf("string");
        // Timestamp should be a valid ISO string
        expect(new Date(tc.timestamp!).toISOString()).toBe(tc.timestamp);
      }
    });

    it("produces text-chunk events with content", () => {
      expect(streamEvents).toBeDefined();

      const textChunks = streamEvents.filter((e) => e.type === "text-chunk");
      expect(textChunks.length).toBeGreaterThan(0);

      // At least some chunks should have non-empty content
      const nonEmptyChunks = textChunks.filter(
        (e) => e.content && e.content.length > 0,
      );
      expect(nonEmptyChunks.length).toBeGreaterThan(0);
    });

    it("produces done event with metadata", () => {
      expect(streamEvents).toBeDefined();

      const done = getDoneEvent(streamEvents);
      expect(done).toBeDefined();
      expect(done!.requestId).toBeTypeOf("string");
      expect(done!.totalTokens).toBeTypeOf("number");
      expect(done!.totalTokens!).toBeGreaterThanOrEqual(0);
      expect(done!.executionTimeMs).toBeTypeOf("number");
      expect(done!.executionTimeMs!).toBeGreaterThan(0);
    });
  });
});
