import { beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

// Streaming event interface
interface StreamEvent {
  type: "thought" | "tool-call" | "text-chunk" | "error" | "done";
  timestamp?: string;
  content?: string;
  name?: string;
  status?: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, any>;
  result?: any;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
  responseType?: string; // For future extensibility: "text_response", "image_response", etc.
}

// Note interface for test data
interface NoteEntry {
  id: string;
  title: string;
  content: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  processingStatus: string;
  dueDate: string | null;
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  originalMimeType?: string | null;
  fileSize?: number | null;
  metadata?: Record<string, any> | null;
}

/**
 * Parse Server-Sent Events from a streaming response
 * @param response - Fetch response with text/event-stream content
 * @returns Array of parsed streaming events
 */
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
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim() === "") continue;
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data.trim() === "") continue;

          try {
            const event = JSON.parse(data) as StreamEvent;
            events.push(event);

            // Stop reading when we get a done event
            if (event.type === "done") {
              return events;
            }
          } catch (parseError) {
            console.warn("Failed to parse SSE event:", data, parseError);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}

/**
 * Validate basic streaming response structure
 * @param events - Array of streaming events
 */
function validateBasicStreamStructure(events: StreamEvent[]) {
  expect(events.length).toBeGreaterThan(0);

  // Should have at least one text-chunk and one done event
  const hasTextChunk = events.some((e) => e.type === "text-chunk");
  const hasDone = events.some((e) => e.type === "done");

  expect(hasTextChunk).toBe(true);
  expect(hasDone).toBe(true);

  // Last event should be done
  const lastEvent = events[events.length - 1];
  expect(lastEvent).toBeDefined();
  expect(lastEvent!.type).toBe("done");
  expect(lastEvent!.requestId).toBeTypeOf("string");
}

/**
 * Get all text content from text-chunk events
 * @param events - Array of streaming events
 * @returns Combined text content
 */
function getCombinedTextContent(events: StreamEvent[]): string {
  const textChunks = events.filter((e) => e.type === "text-chunk");
  console.log(
    "🔍 getCombinedTextContent: Found",
    textChunks.length,
    "text-chunk events",
  );

  const contents = textChunks.map((e) => {
    const content = e.content || "";
    console.log(
      "🔍 getCombinedTextContent: Chunk content:",
      JSON.stringify(content),
    );
    return content;
  });

  const combined = contents.join("");
  console.log(
    "🔍 getCombinedTextContent: Combined result:",
    JSON.stringify(combined),
  );
  return combined;
}

/**
 * Validate that no tool call JSON appears in text-chunk events
 * This is critical to ensure the frontend doesn't display raw JSON
 * @param events - Array of streaming events
 */
function validateNoToolCallJsonInText(events: StreamEvent[]): void {
  const textChunks = events.filter((e) => e.type === "text-chunk");
  const combinedText = textChunks.map((e) => e.content || "").join("");

  // Patterns that indicate tool call JSON leakage
  const toolCallPatterns = [
    /\[\s*\{\s*"functionName"\s*:/, // Array of tool calls: [{"functionName": ...
    /\{\s*"functionName"\s*:\s*"[^"]+"/, // Single tool call: {"functionName": "findNotes"
    /\[\s*\{\s*"tool_name"\s*:/, // Tool results: [{"tool_name": ...
    /\{\s*"tool_name"\s*:\s*"[^"]+"/, // Single tool result: {"tool_name": "findNotes"
    /"arguments"\s*:\s*\{/, // Tool arguments
    /"result"\s*:\s*\[|\{"result"\s*:\s*\{/, // Tool results
  ];

  // Check for unparsed response JSON structures
  const responsePatterns = [
    /\{\s*"type"\s*:\s*"text_response"/, // Raw response JSON: {"type": "text_response"
    /\{\s*"response"\s*:\s*"/, // Response field: {"response": "...
  ];

  console.log(
    "🔍 validateNoToolCallJsonInText: Checking",
    combinedText.length,
    "characters for JSON patterns",
  );

  // Check for tool call patterns
  for (const pattern of toolCallPatterns) {
    const match = combinedText.match(pattern);
    if (match) {
      console.error(
        "❌ CRITICAL: Tool call JSON detected in text-chunk events!",
      );
      console.error("🚨 Pattern matched:", pattern.source);
      console.error("🚨 Match found:", match[0]);
      console.error(
        "🚨 Context:",
        combinedText.substring(match.index! - 50, match.index! + 150),
      );
      console.error("🚨 Full text content:", combinedText);
      throw new Error(
        `Tool call JSON pattern detected in text-chunk: ${match[0]}`,
      );
    }
  }

  // Check for unparsed response patterns
  for (const pattern of responsePatterns) {
    const match = combinedText.match(pattern);
    if (match) {
      console.error(
        "❌ CRITICAL: Unparsed response JSON detected in text-chunk events!",
      );
      console.error("🚨 Pattern matched:", pattern.source);
      console.error("🚨 Match found:", match[0]);
      console.error(
        "🚨 Context:",
        combinedText.substring(match.index! - 50, match.index! + 150),
      );
      console.error("🚨 Full text content:", combinedText);
      throw new Error(
        `Unparsed response JSON pattern detected in text-chunk: ${match[0]}`,
      );
    }
  }

  console.log(
    "✅ validateNoToolCallJsonInText: No JSON patterns detected in text-chunk events",
  );
}

/**
 * Validate that tool calls are properly structured as tool-call events
 * @param events - Array of streaming events
 */
function validateToolCallEventStructure(events: StreamEvent[]): void {
  const toolCallEvents = events.filter((e) => e.type === "tool-call");

  if (toolCallEvents.length === 0) {
    console.log(
      "ℹ️  validateToolCallEventStructure: No tool call events to validate",
    );
    return;
  }

  console.log(
    "🔍 validateToolCallEventStructure: Validating",
    toolCallEvents.length,
    "tool call events",
  );

  for (const event of toolCallEvents) {
    // Must have a name
    expect(event.name).toBeTypeOf("string");
    expect(event.name!.length).toBeGreaterThan(0);

    // Must have a valid status
    expect(["starting", "executing", "completed", "error"]).toContain(
      event.status,
    );

    // Arguments should be present for starting/executing events
    if (event.status === "starting" || event.status === "executing") {
      expect(event.arguments).toBeDefined();
      expect(typeof event.arguments).toBe("object");
    }

    // Result should be present for completed events
    if (event.status === "completed") {
      expect(event.result).toBeDefined();
    }

    // Error should be present for error events
    if (event.status === "error") {
      expect(event.error).toBeTypeOf("string");
      expect(event.error!.length).toBeGreaterThan(0);
    }

    // Should have timestamp
    expect(event.timestamp).toBeTypeOf("string");
  }

  console.log(
    "✅ validateToolCallEventStructure: All tool call events are properly structured",
  );
}

/**
 * Enhanced validation that combines all critical checks
 * @param events - Array of streaming events
 */
function validateStreamingIntegrity(events: StreamEvent[]): void {
  console.log(
    "\n🔍 validateStreamingIntegrity: Running comprehensive validation...",
  );

  // Basic structure validation
  validateBasicStreamStructure(events);

  // JSON isolation validation (critical for frontend)
  validateNoToolCallJsonInText(events);

  // Tool call structure validation
  validateToolCallEventStructure(events);

  // Event sequencing validation
  const eventTypes = events.map((e) => e.type);
  console.log("📊 Event sequence:", eventTypes);

  // Last event must be 'done'
  expect(eventTypes[eventTypes.length - 1]).toBe("done");

  // If there are tool-call events, they should come before the final text-chunk events
  const lastToolCallIndex = eventTypes.lastIndexOf("tool-call");
  const firstTextChunkAfterTools =
    lastToolCallIndex >= 0
      ? eventTypes.findIndex(
          (type, idx) => idx > lastToolCallIndex && type === "text-chunk",
        )
      : -1;

  if (lastToolCallIndex >= 0 && firstTextChunkAfterTools >= 0) {
    console.log("✅ Tool calls properly sequenced before final text chunks");
  }

  console.log("✅ validateStreamingIntegrity: All validation checks passed");
}

describe("Streaming Prompt API Integration Tests", { timeout: 60000 }, () => {
  let testNoteId: string | null = null;

  // Before running streaming tests, create a test note for asset reference tests
  beforeAll(async () => {
    await delay(200);

    // Create a test note that we can reference in streaming prompts
    const noteData = {
      title: "Test Streaming Note",
      content:
        "This is a test note created for streaming API integration tests. It contains information about streaming functionality and SSE events.",
      tags: ["streaming", "test", "sse"],
    };

    const response = await loggedFetch(`${BASE_URL}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(noteData),
    });

    if (response.status === 201) {
      const note = (await response.json()) as NoteEntry;
      testNoteId = note.id;
      console.log(`✅ Test note created for streaming tests: ${testNoteId}`);
    }
  });

  it("POST /api/prompt/stream - basic factual query without tool calls", async () => {
    await delay(200);

    const promptData = {
      prompt:
        "In what year were the United States founded and what is the capital?",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    // Validate comprehensive streaming integrity (includes JSON isolation)
    validateStreamingIntegrity(events);

    // Should not have tool-call events for a simple factual query
    const toolCallEvents = events.filter((e) => e.type === "tool-call");
    expect(toolCallEvents.length).toBe(0);

    // Should have text content about US founding
    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    // Debug logging to see what the AI actually responded
    console.log("\n🔍 DEBUG: Factual Query Test");
    console.log("📊 Total events received:", events.length);
    console.log("📝 All streaming events:", JSON.stringify(events, null, 2));

    // Debug event types
    const eventTypes = events.map((e) => e.type);
    const eventTypeCounts = eventTypes.reduce(
      (acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log("📊 Event type counts:", eventTypeCounts);

    // Debug text-chunk events specifically
    const textChunkEvents = events.filter((e) => e.type === "text-chunk");
    console.log("📄 Text-chunk events count:", textChunkEvents.length);
    console.log(
      "📄 Text-chunk events:",
      textChunkEvents.map((e) => ({
        content: e.content,
        timestamp: e.timestamp,
      })),
    );

    console.log("📄 Combined text content:", textContent);
    console.log("📄 Text content length:", textContent.length);

    const textLower = textContent.toLowerCase();
    const factualKeywords = ["washington", "1776", "founded", "capital"];
    const foundKeywords = factualKeywords.filter((keyword) =>
      textLower.includes(keyword),
    );

    console.log("🔍 Checking keywords in text-chunk content:", factualKeywords);
    console.log("✅ Found keywords in text-chunks:", foundKeywords);
    console.log(
      "❌ Missing keywords in text-chunks:",
      factualKeywords.filter((k) => !foundKeywords.includes(k)),
    );

    // FALLBACK: Search ALL event content regardless of type
    console.log(
      "\n🚨 FALLBACK: Searching ALL event content regardless of type",
    );
    const allEventContent = events
      .map((e) => e.content || "")
      .join("")
      .toLowerCase();
    console.log("📄 All event content combined:", allEventContent);

    const allFoundKeywords = factualKeywords.filter((keyword) =>
      allEventContent.includes(keyword),
    );
    console.log("✅ Found keywords in ALL events:", allFoundKeywords);
    console.log(
      "❌ Missing keywords in ALL events:",
      factualKeywords.filter((k) => !allFoundKeywords.includes(k)),
    );

    const hasFactualKeywords = foundKeywords.length > 0;
    const hasFactualKeywordsInAllEvents = allFoundKeywords.length > 0;

    console.log("\n📊 SUMMARY:");
    console.log("📄 text-chunk events have keywords:", hasFactualKeywords);
    console.log("📄 ANY events have keywords:", hasFactualKeywordsInAllEvents);

    if (!hasFactualKeywords) {
      console.error(
        "❌ TEST FAILURE: No factual keywords found in text-chunk events",
      );
      console.error("📄 text-chunk content:", textContent);
      console.error("📄 All event content:", allEventContent);
      console.error("🔍 Searched for keywords:", factualKeywords);

      // If keywords exist in other events but not text-chunks, this indicates an event type issue
      if (hasFactualKeywordsInAllEvents) {
        console.error(
          "🚨 CRITICAL: Keywords found in other events but NOT in text-chunk events!",
        );
        console.error(
          "🚨 This indicates an SSE event type categorization problem!",
        );
      }
    }

    expect(hasFactualKeywords).toBe(true);
  });

  it("POST /api/prompt/stream - tool calling test for finding notes", async () => {
    await delay(200);

    const promptData = {
      prompt: "Find my last 3 notes",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    // Validate comprehensive streaming integrity (includes JSON isolation)
    validateStreamingIntegrity(events);

    // Should have tool-call events
    const toolCallEvents = events.filter((e) => e.type === "tool-call");
    expect(toolCallEvents.length).toBeGreaterThan(0);

    // Check tool call progression
    const toolNames = new Set(toolCallEvents.map((e) => e.name));
    expect(toolNames.size).toBeGreaterThan(0);

    // Should have at least one tool that looks like a note finder
    const hasNoteTool = Array.from(toolNames).some(
      (name) =>
        name?.toLowerCase().includes("note") ||
        name?.toLowerCase().includes("find"),
    );
    expect(hasNoteTool).toBe(true);

    // Check for status progression in tool calls
    const statusProgression = toolCallEvents.map((e) => e.status);
    expect(statusProgression).toContain("starting");
    expect(statusProgression).toContain("executing");
    expect(statusProgression).toContain("completed");

    // Should have text content about found notes
    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    const textLower = textContent.toLowerCase();
    const hasNoteKeywords =
      textLower.includes("note") ||
      textLower.includes("found") ||
      textLower.includes("recent");

    expect(hasNoteKeywords).toBe(true);

    // Should include note navigation links
    const noteNavigationPattern = /\/notes\/note-[a-zA-Z0-9_-]+/;
    expect(textContent).toMatch(noteNavigationPattern);
  });

  it("POST /api/prompt/stream - asset reference test with note", async () => {
    await delay(200);

    if (!testNoteId) {
      throw new Error(
        "Test note was not created. Cannot run asset reference test.",
      );
    }

    const promptData = {
      prompt: "What is this note about? Summarize its content.",
      context: {
        assets: [
          {
            type: "note",
            id: testNoteId,
          },
        ],
      },
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    // Validate comprehensive streaming integrity (includes JSON isolation)
    validateStreamingIntegrity(events);

    // Should NOT have tool-call events when assets are provided
    const toolCallEvents = events.filter((e) => e.type === "tool-call");
    expect(toolCallEvents.length).toBe(0);

    // Should have text content about the note
    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    const textLower = textContent.toLowerCase();
    const hasRelevantKeywords =
      textLower.includes("streaming") ||
      textLower.includes("test") ||
      textLower.includes("sse") ||
      textLower.includes("note");

    expect(hasRelevantKeywords).toBe(true);
  });

  it("POST /api/prompt/stream - error handling test", async () => {
    await delay(200);

    // Send a request with an invalid conversation ID to trigger an error
    const promptData = {
      prompt: "This should trigger an error",
      conversationId: "invalid-conversation-id-format",
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Invalid conversation ID");
  });

  it("POST /api/prompt/stream - authentication required", async () => {
    await delay(200);

    const promptData = {
      prompt: "This should require authentication",
    };

    const response = await fetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("POST /api/prompt/stream - empty prompt handling", async () => {
    await delay(200);

    const promptData = {
      prompt: "",
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string; message: string };
    expect(data.error).toBe("Invalid request");
    expect(data.message).toContain("prompt");
  });

  it("POST /api/prompt/stream - thinking content streaming", async () => {
    await delay(200);

    // Ask a question that might trigger thinking
    const promptData = {
      prompt:
        "Think about this: what are the benefits of using streaming AI responses?",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    // Validate comprehensive streaming integrity (includes JSON isolation)
    validateStreamingIntegrity(events);

    // Check if we received any thinking events
    const thoughtEvents = events.filter((e) => e.type === "thought");

    // Note: Thinking events are optional and depend on AI model behavior
    // We'll just validate structure if they exist
    if (thoughtEvents.length > 0) {
      thoughtEvents.forEach((event) => {
        expect(event.content).toBeTypeOf("string");
        expect(event.timestamp).toBeTypeOf("string");
      });
    }

    // Should have meaningful text content
    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    const textLower = textContent.toLowerCase();
    const hasStreamingKeywords =
      textLower.includes("stream") ||
      textLower.includes("benefit") ||
      textLower.includes("response") ||
      textLower.includes("real-time") ||
      textLower.includes("immediate");

    expect(hasStreamingKeywords).toBe(true);
  });

  it("POST /api/prompt/stream - conversation streaming test", async () => {
    await delay(200);

    // First, create a conversation by making a regular prompt request
    const initialPromptData = {
      prompt: "Hello, I'd like to start a conversation about AI streaming.",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const initialResponse = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(initialPromptData),
    });

    expect(initialResponse.status).toBe(200);
    const initialData = (await initialResponse.json()) as {
      conversationId: string;
    };
    expect(initialData.conversationId).toBeTypeOf("string");

    const conversationId = initialData.conversationId;

    // Now make a streaming request in the same conversation
    await delay(500); // Small delay to ensure conversation is saved

    const streamPromptData = {
      prompt: "Can you tell me more about the benefits of streaming responses?",
      conversationId: conversationId,
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const streamResponse = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(streamPromptData),
    });

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toBe(
      "text/event-stream",
    );

    const events = await parseSSEStream(streamResponse);

    // Validate comprehensive streaming integrity (includes JSON isolation)
    validateStreamingIntegrity(events);

    // Check that the done event includes the conversation ID
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.conversationId).toBe(conversationId);

    // Should have meaningful text content about streaming
    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    const textLower = textContent.toLowerCase();
    const hasConversationKeywords =
      textLower.includes("stream") ||
      textLower.includes("benefit") ||
      textLower.includes("response") ||
      textLower.includes("real-time");

    expect(hasConversationKeywords).toBe(true);
  });

  // ========== JSON ISOLATION FOCUSED TESTS ==========
  // These tests specifically target the "frontend displays JSON instead of text" issue

  it("POST /api/prompt/stream - JSON isolation validation for tool calls", async () => {
    await delay(200);

    // This test specifically validates that tool call JSON never leaks into text-chunk events
    const promptData = {
      prompt: "Find my most recent 2 notes and tell me their titles",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    console.log(
      "\n🔍 JSON ISOLATION TEST: Analyzing events for JSON leakage...",
    );

    // This is the critical test - ensure no JSON appears in text-chunk events
    validateStreamingIntegrity(events);

    // Additional specific checks for this test
    const textChunks = events.filter((e) => e.type === "text-chunk");
    const toolCallEvents = events.filter((e) => e.type === "tool-call");

    console.log("📊 Event breakdown:");
    console.log("  - text-chunk events:", textChunks.length);
    console.log("  - tool-call events:", toolCallEvents.length);

    // Should have both types
    expect(textChunks.length).toBeGreaterThan(0);
    expect(toolCallEvents.length).toBeGreaterThan(0);

    // Text chunks should contain user-friendly content
    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    // Should mention notes in a user-friendly way
    const textLower = textContent.toLowerCase();
    const hasNoteKeywords =
      textLower.includes("note") || textLower.includes("title");
    expect(hasNoteKeywords).toBe(true);

    // Critical assertion: text content should NOT contain function call patterns
    expect(textContent).not.toMatch(/\[\s*\{\s*"functionName"/);
    expect(textContent).not.toMatch(/\{\s*"functionName"\s*:/);
    expect(textContent).not.toMatch(/"arguments"\s*:\s*\{/);
    expect(textContent).not.toMatch(/\{\s*"type"\s*:\s*"text_response"/);

    console.log(
      "✅ JSON ISOLATION TEST: Tool call JSON properly isolated from text content",
    );
  });

  it("POST /api/prompt/stream - unparsed response detection test", async () => {
    await delay(200);

    // Test a complex query that might trigger multiple iterations and final response parsing
    const promptData = {
      prompt:
        "Search for notes about 'streaming' and then give me a detailed summary of what you found",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    console.log(
      "\n🔍 UNPARSED RESPONSE TEST: Checking for raw response JSON in text...",
    );

    // Comprehensive validation including unparsed response detection
    validateStreamingIntegrity(events);

    const textContent = getCombinedTextContent(events);

    // Critical checks for unparsed response JSON
    expect(textContent).not.toMatch(/\{\s*"type"\s*:\s*"text_response"/);
    expect(textContent).not.toMatch(/\{\s*"response"\s*:\s*"/);
    expect(textContent).not.toMatch(/"response"\s*:\s*"[^"]*"/);

    // Should have meaningful content about streaming/notes
    expect(textContent.length).toBeGreaterThan(0);
    const textLower = textContent.toLowerCase();
    const hasRelevantContent =
      textLower.includes("streaming") ||
      textLower.includes("note") ||
      textLower.includes("found") ||
      textLower.includes("search");
    expect(hasRelevantContent).toBe(true);

    console.log(
      "✅ UNPARSED RESPONSE TEST: No raw response JSON found in text content",
    );
  });

  it("POST /api/prompt/stream - markdown vs JSON distinction test", { timeout: 120000 }, async () => {
    await delay(200);

    // Ask for something that should include legitimate code examples
    const promptData = {
      prompt:
        "Show me how to handle JSON data in JavaScript with code examples",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    console.log(
      "\n🔍 MARKDOWN vs JSON TEST: Validating legitimate markdown is preserved...",
    );

    // Validate overall integrity
    validateStreamingIntegrity(events);

    const textContent = getCombinedTextContent(events);
    expect(textContent.length).toBeGreaterThan(0);

    // This test should allow legitimate code examples in markdown
    // but still catch tool call JSON patterns
    console.log("📄 Text content preview:", textContent.substring(0, 500));

    // Should contain JavaScript/JSON related content
    const textLower = textContent.toLowerCase();
    const hasCodeContent =
      textLower.includes("javascript") ||
      textLower.includes("json") ||
      textLower.includes("parse") ||
      textLower.includes("code");
    expect(hasCodeContent).toBe(true);

    // Legitimate code examples are OK, but tool call patterns should not be present
    // Note: This validates our pattern detection is specific enough
    expect(textContent).not.toMatch(/\[\s*\{\s*"functionName"\s*:/);
    expect(textContent).not.toMatch(/\{\s*"functionName"\s*:\s*"[^"]+"/);
    expect(textContent).not.toMatch(/"arguments"\s*:\s*\{[^}]*"limit"/); // Tool-specific pattern

    console.log(
      "✅ MARKDOWN vs JSON TEST: Legitimate code content preserved, tool JSON patterns absent",
    );
  });

  it("POST /api/prompt/stream - event sequencing and content separation test", async () => {
    await delay(200);

    // Complex query that should trigger tool calls followed by final response
    const promptData = {
      prompt:
        "Find my notes about 'test' and count how many there are, then explain what you found",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
    };

    const response = await loggedFetch(`${BASE_URL}/prompt/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSEStream(response);

    console.log(
      "\n🔍 EVENT SEQUENCING TEST: Analyzing event flow and content separation...",
    );

    // Comprehensive validation
    validateStreamingIntegrity(events);

    // Detailed event sequencing analysis
    const eventTypes = events.map((e) => e.type);
    const toolCallEvents = events.filter((e) => e.type === "tool-call");
    const textChunkEvents = events.filter((e) => e.type === "text-chunk");

    console.log("📊 Event sequence:", eventTypes);
    console.log("📊 Tool call events:", toolCallEvents.length);
    console.log("📊 Text chunk events:", textChunkEvents.length);

    // Should have both tool calls and text chunks
    expect(toolCallEvents.length).toBeGreaterThan(0);
    expect(textChunkEvents.length).toBeGreaterThan(0);

    // Validate tool call progression
    const toolCallStatuses = toolCallEvents.map((e) => e.status);
    expect(toolCallStatuses).toContain("starting");
    expect(toolCallStatuses).toContain("completed");

    // Check content separation - tool calls should have structured data
    const hasProperToolCall = toolCallEvents.some(
      (e) =>
        e.name &&
        e.status === "starting" &&
        e.arguments &&
        typeof e.arguments === "object",
    );
    expect(hasProperToolCall).toBe(true);

    // Text chunks should have user-friendly content only
    const textContent = getCombinedTextContent(events);
    const textLower = textContent.toLowerCase();
    const hasUserFriendlyContent =
      textLower.includes("found") ||
      textLower.includes("note") ||
      textLower.includes("test") ||
      textLower.includes("count");
    expect(hasUserFriendlyContent).toBe(true);

    console.log(
      "✅ EVENT SEQUENCING TEST: Proper event flow and content separation validated",
    );
  });
});
