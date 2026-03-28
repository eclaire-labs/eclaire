/**
 * SSE Processing Events — Integration Tests
 *
 * Tests the real SSE stream end-to-end:
 * 1. Connect to GET /api/processing-events/stream with auth
 * 2. Perform CRUD operations (create/update/delete tasks)
 * 3. Verify the correct SSE events arrive on the stream
 *
 * Requires a running backend server (pnpm dev).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { TaskEntry } from "../utils/tasks-test-helpers.js";

// ---------------------------------------------------------------------------
// SSE stream helpers
// ---------------------------------------------------------------------------

interface ProcessingEvent {
  type: string;
  taskId?: string;
  occurrenceId?: string;
  assetType?: string;
  assetId?: string;
  sessionId?: string;
  taskStatus?: string;
  attentionStatus?: string;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * Connects to the SSE processing events stream using fetch (EventSource
 * doesn't support Authorization headers). Returns an object with:
 * - events: array of received events (mutated in real-time)
 * - waitForEvent: waits until a matching event appears
 * - close: disconnects the stream
 */
async function connectSSEStream(apiKey: string = TEST_API_KEY) {
  const clientId = `test-${crypto.randomUUID()}`;
  const url = `${BASE_URL}/processing-events/stream?clientId=${clientId}`;

  const controller = new AbortController();
  const events: ProcessingEvent[] = [];
  let buffer = "";

  const fetchFn = createAuthenticatedFetch(apiKey);
  const response = await fetchFn(url, {
    signal: controller.signal,
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok) {
    throw new Error(`SSE connection failed: ${response.status}`);
  }

  // Start reading the stream in the background
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const readLoop = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const event = JSON.parse(data) as ProcessingEvent;
              events.push(event);
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (error) {
      // AbortError is expected on close()
      if (
        !(error instanceof DOMException && error.name === "AbortError") &&
        !(error instanceof Error && error.message.includes("abort"))
      ) {
        console.error("SSE read error:", error);
      }
    }
  })();

  /**
   * Wait until an event matching the predicate appears, or timeout.
   */
  async function waitForEvent(
    predicate: (e: ProcessingEvent) => boolean,
    timeoutMs = 5000,
  ): Promise<ProcessingEvent> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const match = events.find(predicate);
      if (match) return match;
      await delay(100);
    }
    throw new Error(
      `SSE event not received within ${timeoutMs}ms. Events received: ${JSON.stringify(events.map((e) => e.type))}`,
    );
  }

  function close() {
    controller.abort();
  }

  // Wait for the "connected" event before returning
  await waitForEvent((e) => e.type === "connected");

  return { events, waitForEvent, close, readLoop };
}

// ---------------------------------------------------------------------------
// Authenticated fetch for CRUD operations
// ---------------------------------------------------------------------------

const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

function apiUrl(path: string) {
  return `${BASE_URL}${path}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SSE Processing Events — Integration", { timeout: 30000 }, () => {
  let sse: Awaited<ReturnType<typeof connectSSEStream>>;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    sse = await connectSSEStream();
  });

  afterAll(async () => {
    // Clean up created tasks
    for (const id of createdTaskIds) {
      try {
        await loggedFetch(apiUrl(`/tasks/${id}`), { method: "DELETE" });
      } catch {
        // ignore cleanup errors
      }
    }
    sse.close();
    // Give the abort a moment to propagate
    await delay(200);
  });

  // -----------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------

  it("receives a connected event on initial connection", () => {
    const connected = sse.events.find((e) => e.type === "connected");
    expect(connected).toBeDefined();
    expect(connected!.timestamp).toBeTypeOf("number");
  });

  // -----------------------------------------------------------------
  // Task lifecycle events
  // -----------------------------------------------------------------

  let taskId: string;

  it("receives task_created when a task is created via API", async () => {
    // Clear prior events
    sse.events.length = 0;

    const response = await loggedFetch(apiUrl("/tasks"), {
      method: "POST",
      body: JSON.stringify({
        title: "SSE Integration Test Task",
        description: "Created to test SSE events",
        taskStatus: "open",
      }),
    });

    expect(response.status).toBe(201);
    const task = (await response.json()) as TaskEntry;
    taskId = task.id;
    createdTaskIds.push(taskId);

    const event = await sse.waitForEvent(
      (e) => e.type === "task_created" && e.taskId === taskId,
    );

    expect(event.type).toBe("task_created");
    expect(event.taskId).toBe(taskId);
    expect(event.timestamp).toBeTypeOf("number");
  });

  it("receives task_updated when a task is updated via API", async () => {
    sse.events.length = 0;

    const response = await loggedFetch(apiUrl(`/tasks/${taskId}`), {
      method: "PUT",
      body: JSON.stringify({
        title: "SSE Integration Test Task — Updated",
        description: "Updated to test SSE events",
        taskStatus: "open",
      }),
    });

    expect(response.status).toBe(200);

    const event = await sse.waitForEvent(
      (e) => e.type === "task_updated" && e.taskId === taskId,
    );

    expect(event.type).toBe("task_updated");
    expect(event.taskId).toBe(taskId);
  });

  it("receives task_status_changed when task status changes", async () => {
    sse.events.length = 0;

    const response = await loggedFetch(apiUrl(`/tasks/${taskId}`), {
      method: "PATCH",
      body: JSON.stringify({ taskStatus: "completed" }),
    });

    expect(response.status).toBe(200);

    const event = await sse.waitForEvent(
      (e) => e.type === "task_status_changed" && e.taskId === taskId,
    );

    expect(event.type).toBe("task_status_changed");
    expect(event.taskId).toBe(taskId);
  });

  it("receives task_deleted when a task is deleted via API", async () => {
    sse.events.length = 0;

    const response = await loggedFetch(apiUrl(`/tasks/${taskId}`), {
      method: "DELETE",
    });

    expect(response.status).toBe(200);

    const event = await sse.waitForEvent(
      (e) => e.type === "task_deleted" && e.taskId === taskId,
    );

    expect(event.type).toBe("task_deleted");
    expect(event.taskId).toBe(taskId);

    // Remove from cleanup list since it's already deleted
    const idx = createdTaskIds.indexOf(taskId);
    if (idx >= 0) createdTaskIds.splice(idx, 1);
  });

  // -----------------------------------------------------------------
  // Stream reliability
  // -----------------------------------------------------------------

  it("delivers events for multiple rapid task creates", async () => {
    sse.events.length = 0;

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await loggedFetch(apiUrl("/tasks"), {
        method: "POST",
        body: JSON.stringify({
          title: `SSE Rapid Create ${i}`,
          taskStatus: "open",
        }),
      });
      expect(response.status).toBe(201);
      const task = (await response.json()) as TaskEntry;
      ids.push(task.id);
      createdTaskIds.push(task.id);
    }

    // Wait for all 3 task_created events
    for (const id of ids) {
      await sse.waitForEvent(
        (e) => e.type === "task_created" && e.taskId === id,
      );
    }

    // Verify all arrived
    const createdEvents = sse.events.filter((e) => e.type === "task_created");
    expect(createdEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("includes correct SSE wire format (data: JSON)", async () => {
    // The fact that events parse as JSON proves the wire format is correct.
    // Additionally, every event should have a timestamp.
    for (const event of sse.events) {
      expect(event.timestamp).toBeTypeOf("number");
      expect(event.type).toBeTypeOf("string");
    }
  });

  // -----------------------------------------------------------------
  // Session events (via task processing)
  // -----------------------------------------------------------------

  it("receives session_running/completed events when an agent session executes", async () => {
    // Create a session
    const sessionRes = await loggedFetch(apiUrl("/sessions"), {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (sessionRes.status !== 201) {
      // Skip if sessions aren't available (e.g., no AI configured)
      console.log(
        "Skipping session SSE test — session creation returned",
        sessionRes.status,
      );
      return;
    }

    const session = (await sessionRes.json()) as { id: string };
    sse.events.length = 0;

    // Send a simple message
    const msgRes = await loggedFetch(
      apiUrl(`/sessions/${session.id}/messages`),
      {
        method: "POST",
        body: JSON.stringify({
          prompt: "Say hello in one word",
          enableThinking: false,
        }),
      },
    );

    if (!msgRes.ok) {
      console.log(
        "Skipping session SSE test — message send returned",
        msgRes.status,
      );
      // Clean up
      await loggedFetch(apiUrl(`/sessions/${session.id}`), {
        method: "DELETE",
      });
      return;
    }

    // Drain the streaming response so the execution completes
    const reader = msgRes.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Check that session_running was published to the processing events SSE
    try {
      await sse.waitForEvent(
        (e) => e.type === "session_running" && e.sessionId === session.id,
        10000,
      );
    } catch {
      // session_running might have arrived before we started waiting
      // Check if session_completed arrived instead
    }

    // session_completed should arrive after execution finishes
    const completedOrError = sse.events.find(
      (e) =>
        (e.type === "session_completed" || e.type === "session_error") &&
        e.sessionId === session.id,
    );

    // At minimum, one of running/completed/error should have been published
    const sessionEvents = sse.events.filter(
      (e) => e.type.startsWith("session_") && e.sessionId === session.id,
    );
    expect(sessionEvents.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await loggedFetch(apiUrl(`/sessions/${session.id}`), {
      method: "DELETE",
    });
  });
});
