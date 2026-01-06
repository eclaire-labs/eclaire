import { beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

interface ToolCallSummary {
  functionName: string;
  executionTimeMs: number;
  success: boolean;
  error?: string;
  arguments?: Record<string, any>;
  resultSummary?: string;
}

interface PromptResponse {
  status: string;
  requestId: string;
  type: "text_response";
  response: string;
  thinkingContent?: string;
  toolCalls?: ToolCallSummary[];
  trace?: any;
}

interface ModelThinkingCapability {
  mode: "never" | "always_on" | "choosable";
  control?: {
    type: "prompt_prefix";
    on: string;
    off: string;
  };
}

interface ModelCapabilities {
  stream: boolean;
  thinking: ModelThinkingCapability;
}

interface ModelConfigResponse {
  provider: string;
  modelShortName: string;
  modelFullName: string;
  modelUrl: string;
  capabilities: ModelCapabilities;
  description: string;
}

// Custom interface for Bookmark API response used in prompt tests
interface BookmarkEntry {
  id: string;
  title: string;
  url: string;
  dateCreated: string;
  dateUpdated: string;
  tags: string[];
}

describe("Prompt API Integration Tests", { timeout: 30000 }, () => {
  let testBookmarkId: string | null = null;
  let currentModelConfig: ModelConfigResponse | null = null;

  // Helper function to check if current model supports thinking
  const modelSupportsThinking = (): boolean => {
    if (!currentModelConfig) return false;
    const thinkingMode = currentModelConfig.capabilities.thinking.mode;
    return thinkingMode === "choosable" || thinkingMode === "always_on";
  };

  // Before running prompt tests, create test data that we can reference
  beforeAll(async () => {
    await delay(200);

    // Fetch current model configuration
    try {
      const modelResponse = await loggedFetch(`${BASE_URL}/model`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      if (modelResponse.status === 200) {
        currentModelConfig =
          (await modelResponse.json()) as ModelConfigResponse;
        console.info(
          `Model configuration loaded: ${currentModelConfig.provider}:${currentModelConfig.modelShortName}, thinking mode: ${currentModelConfig.capabilities.thinking.mode}`,
        );
      } else {
        console.warn(
          "Failed to fetch model configuration, thinking tests may not work correctly",
        );
      }
    } catch (error) {
      console.warn("Error fetching model configuration:", error);
    }

    // Create a test bookmark that we can reference in our prompt tests
    const bookmarkData = {
      title: "Test AI Integration Bookmark",
      url: "https://example.com/ai-test",
      tags: ["ai", "test", "integration"],
    };

    const bookmarkResponse = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(bookmarkData),
    });

    if (bookmarkResponse.status === 201) {
      const bookmark = (await bookmarkResponse.json()) as BookmarkEntry;
      testBookmarkId = bookmark.id;
    }

    // Create a test note for findNotes testing
    // Use enabled: false to prevent AI processing from overwriting the tags
    const noteData = {
      title: "AI Assistant Test Note",
      content:
        "This is a test note for AI integration testing with specific content.",
      tags: ["ai-test", "findnotes", "integration"],
      enabled: false,
    };

    const noteResponse = await loggedFetch(`${BASE_URL}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(noteData),
    });

    if (noteResponse.status === 201) {
      const note = (await noteResponse.json()) as { id: string };
      console.info(`Test note created: ${note.id}`);
    } else {
      console.warn(
        `Failed to create test note: ${noteResponse.status} ${await noteResponse.text()}`,
      );
    }
  });

  it("GET /api/model - should return current model configuration", async () => {
    await delay(200);

    const response = await loggedFetch(`${BASE_URL}/model`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as ModelConfigResponse;

    // Verify response structure
    expect(data).toBeDefined();
    expect(data.provider).toBeTypeOf("string");
    expect(data.modelShortName).toBeTypeOf("string");
    expect(data.modelFullName).toBeTypeOf("string");
    expect(data.modelUrl).toBeTypeOf("string");
    expect(data.description).toBeTypeOf("string");

    // Verify capabilities structure
    expect(data.capabilities).toBeDefined();
    expect(data.capabilities.stream).toBeTypeOf("boolean");
    expect(data.capabilities.thinking).toBeDefined();
    expect(data.capabilities.thinking.mode).toMatch(
      /^(never|always_on|choosable)$/,
    );

    // Verify sensitive fields are excluded
    expect(data).not.toHaveProperty("apiKey");
    expect(data).not.toHaveProperty("providerUrl");

    // Verify thinking control structure if present
    if (data.capabilities.thinking.control) {
      expect(data.capabilities.thinking.control.type).toBe("prompt_prefix");
      expect(data.capabilities.thinking.control.on).toBeTypeOf("string");
      expect(data.capabilities.thinking.control.off).toBeTypeOf("string");
    }

    console.info(
      `Model: ${data.provider}:${data.modelShortName}, stream: ${data.capabilities.stream}, thinking: ${data.capabilities.thinking.mode}`,
    );
  });

  it("POST /api/prompt - should handle basic greetings", async () => {
    await delay(200);

    const promptData = {
      prompt: "Hello",
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Should respond appropriately to greeting
    const response_lower = data.response.toLowerCase();
    const hasGreetingKeywords =
      response_lower.includes("hello") ||
      response_lower.includes("hi") ||
      response_lower.includes("hey") ||
      response_lower.includes("greet");

    expect(hasGreetingKeywords).toBe(true);

    // Should not have tool calls for simple greeting
    expect(data.toolCalls).toBeUndefined();
  });

  it("POST /api/prompt - should handle simple questions without tools", async () => {
    await delay(200);

    const promptData = {
      prompt: "How are you doing today?",
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Should not have tool calls for simple question
    expect(data.toolCalls).toBeUndefined();
  });

  it("POST /api/prompt - should know the user's name", async () => {
    await delay(200);

    const promptData = {
      prompt: "What is my name?",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.requestId).toBeTypeOf("string");

    // The AI should reference the user's name in the response
    // Based on the test data, this should include a personalized response
    expect(data.response.length).toBeGreaterThan(0);

    // Response should not have tool calls for simple name query
    expect(data.toolCalls).toBeUndefined();

    // Should not have thinking content by default
    expect(data.thinkingContent).toBeUndefined();
  });

  it("POST /api/prompt - should be able to tell what time it is", async () => {
    await delay(200);

    const currentTime = new Date();
    const promptData = {
      prompt: "What time is it right now?",
      deviceInfo: {
        dateTime: currentTime.toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");

    // The AI should provide time-related information in the response
    const response_lower = data.response.toLowerCase();
    const hasTimeKeywords =
      response_lower.includes("time") ||
      response_lower.includes("clock") ||
      response_lower.includes("now") ||
      response_lower.includes("current") ||
      response_lower.includes(currentTime.getFullYear().toString()) ||
      response_lower.includes("today");

    expect(hasTimeKeywords).toBe(true);

    // Should not have tool calls for time query
    expect(data.toolCalls).toBeUndefined();

    // Should not have thinking content by default
    expect(data.thinkingContent).toBeUndefined();
  });

  it("POST /api/prompt - should find the latest bookmark and provide navigation info", async () => {
    await delay(200);

    const promptData = {
      prompt: "What is my most recent bookmark? I want to navigate to it.",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");

    // The AI should provide a navigation link in the format /bookmarks/bm-xxx
    const bookmarkLinkPattern = /\/bookmarks\/bm-[a-zA-Z0-9_-]+/;
    expect(data.response).toMatch(bookmarkLinkPattern);

    // The response should also mention the bookmark title or URL
    const response_lower = data.response.toLowerCase();
    const hasBookmarkKeywords =
      response_lower.includes("bookmark") ||
      response_lower.includes("recent") ||
      response_lower.includes("latest");

    expect(hasBookmarkKeywords).toBe(true);

    // Should have tool calls for bookmark search
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    // Should not have thinking content by default
    expect(data.thinkingContent).toBeUndefined();
  });

  it("POST /api/prompt - should handle requests without deviceInfo", async () => {
    await delay(200);

    const promptData = {
      prompt: "Hello, can you help me?",
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Should not have tool calls for simple help request
    expect(data.toolCalls).toBeUndefined();

    // Should not have thinking content by default
    expect(data.thinkingContent).toBeUndefined();
  });

  it("POST /api/prompt - should require authentication", async () => {
    await delay(200);

    const promptData = {
      prompt: "What is my name?",
    };

    const response = await fetch(`${BASE_URL}/prompt`, {
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

  it("POST /api/prompt - should handle empty prompts gracefully", async () => {
    await delay(200);

    const promptData = {
      prompt: "",
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
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

  it("POST /api/prompt - should return tool call information when tools are executed", async () => {
    await delay(200);

    const promptData = {
      prompt: "Find my most recent bookmark and tell me about it",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      trace: false, // Explicitly test without trace to ensure tool calls work independently
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.requestId).toBeTypeOf("string");

    // Tool calls should be present when tools are executed
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    // Check the structure of tool call information
    const toolCall = data.toolCalls![0];
    expect(toolCall).toBeDefined();
    expect(toolCall!.functionName).toBeTypeOf("string");
    expect(toolCall!.executionTimeMs).toBeTypeOf("number");
    expect(toolCall!.success).toBeTypeOf("boolean");
    expect(toolCall!.executionTimeMs).toBeGreaterThanOrEqual(0);

    // The tool call should likely be 'findBookmarks' for this test
    expect(toolCall!.functionName).toMatch(/bookmark|find/i);

    // Arguments should be present and be an object
    if (toolCall!.arguments) {
      expect(typeof toolCall!.arguments).toBe("object");
    }

    // Result summary should be present for successful calls
    if (toolCall!.success) {
      expect(toolCall!.resultSummary).toBeTypeOf("string");
      expect(toolCall!.resultSummary!.length).toBeGreaterThan(0);
    }

    // Trace should not be present when trace=false
    expect(data.trace).toBeUndefined();
  });

  it("POST /api/prompt - should return tool calls with trace when trace=true", async () => {
    await delay(200);

    const promptData = {
      prompt: "Find my latest bookmark",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      trace: true, // Test with trace enabled
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");

    // Both tool calls and trace should be present
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    expect(data.trace).toBeDefined();
    expect(data.trace.enabled).toBe(true);
    expect(Array.isArray(data.trace.toolCalls)).toBe(true);

    // Tool calls in main response and trace should have same count
    expect(data.toolCalls!.length).toBe(data.trace.toolCalls.length);
  });

  it(
    "POST /api/prompt - should return thinking content when enableThinking=true",
    { timeout: 60000 },
    async () => {
      // Skip this test if the current model doesn't support thinking
      if (!modelSupportsThinking()) {
        console.info(
          `Skipping thinking test - current model (${currentModelConfig?.provider}:${currentModelConfig?.modelShortName}) has thinking mode: ${currentModelConfig?.capabilities.thinking.mode}`,
        );
        return;
      }

      await delay(200);

      const promptData = {
        prompt: "What is 2 + 2?",
        deviceInfo: {
          dateTime: new Date().toISOString(),
          timeZone: "America/New_York",
        },
        enableThinking: true,
      };

      const response = await loggedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as PromptResponse;

      expect(data).toBeDefined();
      expect(data.status).toBe("OK");
      expect(data.type).toBe("text_response");
      expect(data.response).toBeTypeOf("string");
      expect(data.response.length).toBeGreaterThan(0);

      // Thinking content should be present and separate from main response
      expect(data.thinkingContent).toBeDefined();
      expect(data.thinkingContent).toBeTypeOf("string");
      expect(data.thinkingContent!.length).toBeGreaterThan(0);

      // Thinking content should not be included in the main response
      expect(data.response).not.toContain("<think>");
      expect(data.response).not.toContain("</think>");
    },
  );

  it("POST /api/prompt - should not return thinking content when enableThinking=false", async () => {
    await delay(200);

    const promptData = {
      prompt:
        "Think about what my most recent bookmark might be about and explain your reasoning",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Thinking content should not be present
    expect(data.thinkingContent).toBeUndefined();

    // Main response should not contain thinking tags
    expect(data.response).not.toContain("<think>");
    expect(data.response).not.toContain("</think>");
  });

  it("POST /api/prompt - should not return thinking content by default", async () => {
    await delay(200);

    const promptData = {
      prompt:
        "Think about what my most recent bookmark might be about and explain your reasoning",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      // enableThinking not specified, should default to false
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");

    // Thinking content should not be present by default
    expect(data.thinkingContent).toBeUndefined();
  });

  it("POST /api/prompt - should find notes using findNotes tool", async () => {
    await delay(200);

    const promptData = {
      prompt: "Find my notes that are tagged with 'ai-test'",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false, // Keep fast for most tests
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Tool calls should be present when finding notes
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    // Should have called findNotes tool
    const notesTool = data.toolCalls!.find((call) =>
      call.functionName.toLowerCase().includes("note"),
    );
    expect(notesTool).toBeDefined();
    expect(notesTool!.success).toBe(true);

    // Response should mention the test note
    const response_lower = data.response.toLowerCase();
    expect(
      response_lower.includes("ai assistant test note") ||
        response_lower.includes("ai-test") ||
        response_lower.includes("test note"),
    ).toBe(true);
  });

  it("POST /api/prompt - should use countBookmarks tool for counting", async () => {
    await delay(200);

    const promptData = {
      prompt: "How many bookmarks do I have with the tag 'test'?",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Tool calls should be present for counting
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    // Should have called countBookmarks tool
    const countTool = data.toolCalls!.find(
      (call) =>
        call.functionName.toLowerCase().includes("count") &&
        call.functionName.toLowerCase().includes("bookmark"),
    );
    expect(countTool).toBeDefined();
    expect(countTool!.success).toBe(true);

    // Response should contain a number
    const hasNumber = /\d+/.test(data.response);
    expect(hasNumber).toBe(true);
  });

  it("POST /api/prompt - should find notes with tags parameter", async () => {
    await delay(200);

    const promptData = {
      prompt: "Find notes tagged with 'findnotes'",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");

    // Should have tool calls
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    // Check that the tool was called with proper arguments
    const findNotesTool = data.toolCalls!.find((call) =>
      call.functionName.toLowerCase().includes("note"),
    );
    expect(findNotesTool).toBeDefined();
    expect(findNotesTool!.success).toBe(true);

    // The arguments should include tags parameter
    if (findNotesTool!.arguments) {
      expect(findNotesTool!.arguments.tags).toBeDefined();
    }

    // Response should contain proper internal note links (not [notes] format)
    const responseText = data.response.toLowerCase();
    const hasCorrectNoteLinks = /\/notes\/note-\w+/.test(data.response);
    const hasTestNoteReference =
      responseText.includes("test note") ||
      responseText.includes("ai assistant test note");
    expect(hasCorrectNoteLinks || hasTestNoteReference).toBe(true);
  });

  it(
    "POST /api/prompt - should properly clean thinking content of tags",
    { timeout: 60000 },
    async () => {
      // Skip this test if the current model doesn't support thinking
      if (!modelSupportsThinking()) {
        console.info(
          `Skipping thinking content cleaning test - current model (${currentModelConfig?.provider}:${currentModelConfig?.modelShortName}) has thinking mode: ${currentModelConfig?.capabilities.thinking.mode}`,
        );
        return;
      }

      await delay(200);

      const promptData = {
        prompt: "What is 2 + 2?",
        deviceInfo: {
          dateTime: new Date().toISOString(),
          timeZone: "America/New_York",
        },
        enableThinking: true,
      };

      const response = await loggedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as PromptResponse;

      expect(data).toBeDefined();
      expect(data.status).toBe("OK");
      expect(data.type).toBe("text_response");

      // Critical: main response should never contain thinking tags
      expect(data.response).not.toContain("<think>");
      expect(data.response).not.toContain("</think>");

      // If thinking content is present, it should also be clean of tags
      if (data.thinkingContent) {
        expect(data.thinkingContent).toBeTypeOf("string");
        expect(data.thinkingContent.length).toBeGreaterThan(0);

        // Critical: thinking content itself should not contain thinking tags
        expect(data.thinkingContent).not.toContain("<think>");
        expect(data.thinkingContent).not.toContain("</think>");
      }
    },
  );

  it("POST /api/prompt - should not leak tool call JSON into text response", async () => {
    await delay(200);

    const promptData = {
      prompt:
        "Find my most recent bookmark and tell me about it in a natural way",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");

    // Should have tool calls
    expect(data.toolCalls).toBeDefined();
    expect(Array.isArray(data.toolCalls)).toBe(true);
    expect(data.toolCalls!.length).toBeGreaterThan(0);

    // Critical: main response should not contain raw JSON from tool calls
    expect(data.response).not.toMatch(/\{\s*".*":\s*.*\}/); // No JSON objects
    expect(data.response).not.toContain("findBookmarks"); // No function names
    expect(data.response).not.toContain('"arguments"'); // No tool call structure
    expect(data.response).not.toContain('"limit"'); // No tool call parameters

    // Response should be natural human language
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);
  });

  it("POST /api/prompt - should not confuse markdown JSON code blocks with tool calls", async () => {
    await delay(200);

    const promptData = {
      prompt:
        "Show me an example API response format in markdown with a JSON code block for user data",
      deviceInfo: {
        dateTime: new Date().toISOString(),
        timeZone: "America/New_York",
      },
      enableThinking: false,
    };

    const response = await loggedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as PromptResponse;

    expect(data).toBeDefined();
    expect(data.status).toBe("OK");
    expect(data.type).toBe("text_response");

    // Should NOT have tool calls for this request - we're asking for documentation/examples
    expect(data.toolCalls).toBeUndefined();

    // Response should contain markdown with JSON code blocks
    expect(data.response).toBeTypeOf("string");
    expect(data.response.length).toBeGreaterThan(0);

    // Should contain markdown formatting
    const response_lower = data.response.toLowerCase();
    const hasMarkdownOrJson =
      response_lower.includes("```") ||
      response_lower.includes("json") ||
      response_lower.includes("{") ||
      response_lower.includes("api");
    expect(hasMarkdownOrJson).toBe(true);
  });
});
