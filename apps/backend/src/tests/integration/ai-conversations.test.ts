import { beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
  TEST_API_KEY_2,
} from "../utils/test-helpers.js";
import type { Conversation } from "../utils/types.js";

// Model configuration interfaces
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
  enabled: boolean;
  notes: string;
  tags: string[];
}

// Timeout for tests that involve AI assistant interactions
const AI_TEST_TIMEOUT = 120000;

describe("AI Conversations Integration Tests", () => {
  let createdConversationId: string | null = null;
  let secondConversationId: string | null = null;
  let currentModelConfig: ModelConfigResponse | null = null;
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);

  // Helper function to check if current model supports thinking
  const modelSupportsThinking = (): boolean => {
    if (!currentModelConfig) return false;
    const thinkingMode = currentModelConfig.capabilities.thinking.mode;
    return thinkingMode === "choosable" || thinkingMode === "always_on";
  };

  // Setup model configuration and test data
  beforeAll(async () => {
    await delay(200);

    // Fetch current model configuration
    try {
      const modelResponse = await authenticatedFetch(`${BASE_URL}/model`, {
        method: "GET",
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
  });

  // Test data
  const initialConversationData = {
    title: "Test Conversation",
  };

  const updatedConversationData = {
    title: "Updated Test Conversation",
  };

  const testPrompt = "Hello, this is a test message for the AI assistant.";

  // --- Conversation CRUD Tests ---

  it("POST /api/conversations - should create a new conversation", async () => {
    await delay(200);
    const response = await authenticatedFetch(`${BASE_URL}/conversations`, {
      method: "POST",
      body: JSON.stringify(initialConversationData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.status).toBe("OK");
    expect(data.conversation).toBeDefined();

    const conversation = data.conversation as Conversation;
    createdConversationId = conversation.id;
    expect(createdConversationId).not.toBeNull();

    // Verify conversation structure
    expect(conversation.id).toMatch(/^conv-[A-Za-z0-9]{15}$/);
    expect(conversation.title).toBe(initialConversationData.title);
    expect(conversation.messageCount).toBe(0);
    expect(conversation.userId).toBeDefined();
    expect(conversation.createdAt).toBeDefined();
    expect(conversation.updatedAt).toBeDefined();
    expect(conversation.lastMessageAt).toBeNull();
  });

  it("GET /api/conversations - should list user's conversations", async () => {
    expect(
      createdConversationId,
      "Test setup failed: createdConversationId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(`${BASE_URL}/conversations`, {
      method: "GET",
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.status).toBe("OK");
    expect(data.conversations).toBeInstanceOf(Array);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.limit).toBe(50);
    expect(data.pagination.offset).toBe(0);

    const conversations = data.conversations as Conversation[];
    expect(conversations.length).toBeGreaterThan(0);

    const found = conversations.find((c) => c.id === createdConversationId);
    expect(
      found,
      `Conversation with ID ${createdConversationId} not found in the list`,
    ).toBeDefined();
    expect(found?.title).toBe(initialConversationData.title);
  });

  it("GET /api/conversations/:id - should retrieve specific conversation", async () => {
    expect(
      createdConversationId,
      "Test setup failed: createdConversationId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/conversations/${createdConversationId}`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.status).toBe("OK");
    expect(data.conversation).toBeDefined();

    const conversation = data.conversation as Conversation;
    expect(conversation.id).toBe(createdConversationId);
    expect(conversation.title).toBe(initialConversationData.title);
    expect(conversation.messages).toBeDefined();
    expect(conversation.messages).toBeInstanceOf(Array);
    expect(conversation.messages?.length).toBe(0);
  });

  it("PUT /api/conversations/:id - should update conversation", async () => {
    expect(
      createdConversationId,
      "Test setup failed: createdConversationId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/conversations/${createdConversationId}`,
      {
        method: "PUT",
        body: JSON.stringify(updatedConversationData),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.status).toBe("OK");
    expect(data.conversation).toBeDefined();

    const conversation = data.conversation as Conversation;
    expect(conversation.id).toBe(createdConversationId);
    expect(conversation.title).toBe(updatedConversationData.title);
  });

  it(
    "POST /api/prompt - should send message to existing conversation",
    async () => {
      expect(
        createdConversationId,
        "Test setup failed: createdConversationId is null",
      ).not.toBeNull();

      const promptData = {
        prompt: testPrompt,
        conversationId: createdConversationId,
        trace: false,
      };

      const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.type).toBeDefined();
      expect(data.response).toBeDefined();
      expect(data.conversationId).toBe(createdConversationId);
      expect(data.requestId).toBeDefined();

      // Verify the conversation now has messages
      const conversationResponse = await authenticatedFetch(
        `${BASE_URL}/conversations/${createdConversationId}`,
        {
          method: "GET",
        },
      );

      expect(conversationResponse.status).toBe(200);
      const conversationData = (await conversationResponse.json()) as any;
      const conversation = conversationData.conversation as Conversation;
      expect(conversation.messages?.length).toBeGreaterThan(0);
      expect(conversation.messageCount).toBeGreaterThan(0);
      expect(conversation.lastMessageAt).not.toBeNull();
    },
    AI_TEST_TIMEOUT,
  );

  // --- Prompt Integration Tests ---

  it(
    "POST /api/prompt - should create new conversation when no conversationId provided",
    async () => {
      const promptData = {
        prompt: "Create a new conversation for testing",
        trace: false,
      };

      const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.conversationId).toBeDefined();
      expect(data.conversationId).toMatch(/^conv-[A-Za-z0-9]{15}$/);
      expect(data.response).toBeDefined();
      expect(data.requestId).toBeDefined();

      secondConversationId = data.conversationId;
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "POST /api/prompt - should continue existing conversation when conversationId provided",
    async () => {
      expect(
        createdConversationId,
        "Test setup failed: createdConversationId is null",
      ).not.toBeNull();

      const promptData = {
        prompt: "Continue the existing conversation",
        conversationId: createdConversationId,
        trace: false,
      };

      const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.conversationId).toBe(createdConversationId);
      expect(data.response).toBeDefined();
      expect(data.requestId).toBeDefined();
    },
    AI_TEST_TIMEOUT,
  );

  // --- Error Handling Tests ---

  it("GET /api/conversations/invalid-id - should return 400 for invalid conversation ID", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/conversations/invalid-id`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Invalid conversation ID");
  });

  it("GET /api/conversations/conv-AbCdEfGhIjKlMnO - should return 404 for non-existent conversation", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/conversations/conv-AbCdEfGhIjKlMnO`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(404);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Conversation not found");
  });

  it("POST /api/conversations - should return 400 for invalid request body", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/conversations`, {
      method: "POST",
      body: JSON.stringify({ title: "" }), // Empty title should fail validation
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Invalid request format");
  });

  it("POST /api/prompt - should return 400 for invalid conversationId", async () => {
    const promptData = {
      prompt: "Test with invalid conversation ID",
      conversationId: "invalid-conversation-id",
    };

    const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      body: JSON.stringify(promptData),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();
  });

  // --- End-to-End Flow Tests ---

  it(
    "Complete conversation lifecycle - create, message, update, delete",
    async () => {
      // Create conversation
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Lifecycle Test Conversation" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const conversationId = createData.conversation.id;

      // Send message
      const messageResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Test message for lifecycle",
          conversationId: conversationId,
        }),
      });

      expect(messageResponse.status).toBe(200);

      // Update conversation
      const updateResponse = await authenticatedFetch(
        `${BASE_URL}/conversations/${conversationId}`,
        {
          method: "PUT",
          body: JSON.stringify({ title: "Updated Lifecycle Test" }),
        },
      );

      expect(updateResponse.status).toBe(200);

      // Delete conversation
      const deleteResponse = await authenticatedFetch(
        `${BASE_URL}/conversations/${conversationId}`,
        {
          method: "DELETE",
        },
      );

      expect(deleteResponse.status).toBe(200);

      // Verify deletion
      const getResponse = await authenticatedFetch(
        `${BASE_URL}/conversations/${conversationId}`,
        {
          method: "GET",
        },
      );

      expect(getResponse.status).toBe(404);
    },
    AI_TEST_TIMEOUT,
  );

  // --- Validation Tests ---

  it("should validate conversation ID format", async () => {
    const invalidIds = [
      "conv-",
      "conv-short",
      "conv-toolongtobevalid123456789",
      "wrong-AbCdEfGhIjKlMnO",
      "conv_AbCdEfGhIjKlMnO",
      "conv-AbCdEfGhIjKlMn@",
    ];

    for (const invalidId of invalidIds) {
      const response = await authenticatedFetch(
        `${BASE_URL}/conversations/${invalidId}`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(400);
      const data = (await response.json()) as any;
      expect(data.error).toBe("Invalid conversation ID");
    }
  });

  it("should validate prompt content", async () => {
    expect(
      createdConversationId,
      "Test setup failed: createdConversationId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
      method: "POST",
      body: JSON.stringify({
        prompt: "", // Empty prompt should fail
        conversationId: createdConversationId,
      }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Invalid request");
  });

  it("should handle pagination for conversation list", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/conversations?limit=10&offset=0`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.status).toBe("OK");
    expect(data.conversations).toBeInstanceOf(Array);
    expect(data.pagination).toBeDefined();
    expect(data.pagination.limit).toBe(10);
    expect(data.pagination.offset).toBe(0);
    expect(data.conversations.length).toBeLessThanOrEqual(10);
  });

  // --- Advanced Feature Tests ---

  it(
    "should handle trace functionality in conversation messages",
    async () => {
      expect(
        createdConversationId,
        "Test setup failed: createdConversationId is null",
      ).not.toBeNull();

      const promptData = {
        prompt: "Test message with trace enabled",
        conversationId: createdConversationId,
        trace: true,
      };

      const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.response).toBeDefined();

      // If trace is enabled, trace data should be included
      if (data.trace) {
        expect(data.trace).toBeDefined();
        expect(data.trace.enabled).toBe(true);
        expect(data.trace.requestBody).toBeDefined();
        expect(data.trace.context).toBeDefined();
        expect(data.trace.summary).toBeDefined();
      }
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should handle conversation messages",
    async () => {
      expect(
        createdConversationId,
        "Test setup failed: createdConversationId is null",
      ).not.toBeNull();

      const promptData = {
        prompt: "Test message",
        conversationId: createdConversationId,
      };

      const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.response).toBeDefined();
      expect(data.conversationId).toBe(createdConversationId);
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should handle prompt without conversation ID",
    async () => {
      const promptData = {
        prompt: "Test prompt",
        trace: false,
      };

      const response = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify(promptData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.response).toBeDefined();
      expect(data.conversationId).toBeDefined();
      expect(data.conversationId).toMatch(/^conv-[A-Za-z0-9]{15}$/);
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should handle message ordering in conversations",
    async () => {
      // Create a new conversation for this test
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Message Order Test" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const testConversationId = createData.conversation.id;

      try {
        // Send multiple messages in sequence
        const messages = ["First message", "Second message", "Third message"];

        for (const message of messages) {
          const messageResponse = await authenticatedFetch(
            `${BASE_URL}/prompt`,
            {
              method: "POST",
              body: JSON.stringify({
                prompt: message,
                conversationId: testConversationId,
              }),
            },
          );

          expect(messageResponse.status).toBe(200);
          await delay(100); // Small delay to ensure ordering
        }

        // Retrieve conversation and check message order
        const getResponse = await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "GET",
          },
        );

        expect(getResponse.status).toBe(200);
        const getData = (await getResponse.json()) as any;
        const conversation = getData.conversation as Conversation;

        expect(conversation.messages).toBeDefined();
        expect(conversation.messages!.length).toBeGreaterThan(0);

        // Check that messages are ordered by creation time
        for (let i = 1; i < conversation.messages!.length; i++) {
          const currentMsg = conversation.messages![i];
          const previousMsg = conversation.messages![i - 1];

          expect(currentMsg).toBeDefined();
          expect(previousMsg).toBeDefined();

          expect(
            new Date(currentMsg!.createdAt).getTime(),
          ).toBeGreaterThanOrEqual(new Date(previousMsg!.createdAt).getTime());
        }
      } finally {
        // Cleanup
        await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "DELETE",
          },
        );
      }
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should handle conversation activity updates",
    async () => {
      expect(
        createdConversationId,
        "Test setup failed: createdConversationId is null",
      ).not.toBeNull();

      // Get initial conversation state
      const initialResponse = await authenticatedFetch(
        `${BASE_URL}/conversations/${createdConversationId}`,
        {
          method: "GET",
        },
      );

      expect(initialResponse.status).toBe(200);
      const initialData = (await initialResponse.json()) as any;
      const initialConversation = initialData.conversation as Conversation;
      const initialMessageCount = initialConversation.messageCount;
      const initialLastMessageAt = initialConversation.lastMessageAt;

      // Send a new message
      const messageResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Activity update test message",
          conversationId: createdConversationId,
        }),
      });

      expect(messageResponse.status).toBe(200);

      // Get updated conversation state
      const updatedResponse = await authenticatedFetch(
        `${BASE_URL}/conversations/${createdConversationId}`,
        {
          method: "GET",
        },
      );

      expect(updatedResponse.status).toBe(200);
      const updatedData = (await updatedResponse.json()) as any;
      const updatedConversation = updatedData.conversation as Conversation;

      // Verify activity was updated
      expect(updatedConversation.messageCount).toBeGreaterThan(
        initialMessageCount,
      );
      expect(updatedConversation.lastMessageAt).not.toBe(initialLastMessageAt);
      expect(updatedConversation.lastMessageAt).not.toBeNull();
    },
    AI_TEST_TIMEOUT,
  );

  // --- Multi-User Isolation Tests ---

  it("should create second user's conversation for isolation testing", async () => {
    // Create a second authenticated fetch with different API key
    const secondUserFetch = createAuthenticatedFetch(TEST_API_KEY_2);

    const response = await secondUserFetch(`${BASE_URL}/conversations`, {
      method: "POST",
      body: JSON.stringify({ title: "Second User's Conversation" }),
    });

    // This might fail if second user doesn't exist, but that's expected
    // We'll handle this gracefully in the actual isolation tests
    if (response.status === 200) {
      const data = (await response.json()) as any;
      expect(data.conversation.title).toBe("Second User's Conversation");
    }
  });

  it("should isolate conversations between users", async () => {
    expect(
      createdConversationId,
      "Test setup failed: createdConversationId is null",
    ).not.toBeNull();

    // Try to access main user's conversation with different API key
    const secondUserFetch = createAuthenticatedFetch(TEST_API_KEY_2);

    const response = await secondUserFetch(
      `${BASE_URL}/conversations/${createdConversationId}`,
      {
        method: "GET",
      },
    );

    // Should return 404 (conversation not found) or 401 (unauthorized)
    expect([401, 404]).toContain(response.status);
  });

  it("should isolate conversation lists between users", async () => {
    // Get conversations for main user
    const mainUserResponse = await authenticatedFetch(
      `${BASE_URL}/conversations`,
      {
        method: "GET",
      },
    );

    expect(mainUserResponse.status).toBe(200);
    const mainUserData = (await mainUserResponse.json()) as any;
    const mainUserConversations = mainUserData.conversations;

    // Try to get conversations for different user
    const secondUserFetch = createAuthenticatedFetch(TEST_API_KEY_2);
    const secondUserResponse = await secondUserFetch(
      `${BASE_URL}/conversations`,
      {
        method: "GET",
      },
    );

    if (secondUserResponse.status === 200) {
      const secondUserData = (await secondUserResponse.json()) as any;
      const secondUserConversations = secondUserData.conversations;

      // Verify that no conversation IDs overlap between users
      const mainUserIds = new Set(
        mainUserConversations.map((c: Conversation) => c.id),
      );
      const secondUserIds = new Set(
        secondUserConversations.map((c: Conversation) => c.id),
      );

      const intersection = [...mainUserIds].filter((id) =>
        secondUserIds.has(id),
      );
      expect(intersection.length).toBe(0);
    }
  });

  it(
    "should prevent sending messages to other user's conversations",
    async () => {
      expect(
        createdConversationId,
        "Test setup failed: createdConversationId is null",
      ).not.toBeNull();

      // Try to send message to main user's conversation with different API key
      const secondUserFetch = createAuthenticatedFetch(TEST_API_KEY_2);

      const response = await secondUserFetch(`${BASE_URL}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Unauthorized message attempt",
          conversationId: createdConversationId,
        }),
      });

      // Should return 404 (conversation not found) or 401 (unauthorized)
      expect([401, 404]).toContain(response.status);
    },
    AI_TEST_TIMEOUT,
  );

  // --- Thinking Content and Tool Call Persistence Tests ---

  it(
    "should persist and retrieve thinking content in conversations",
    async () => {
      // Skip this test if the current model doesn't support thinking
      if (!modelSupportsThinking()) {
        console.info(
          `Skipping thinking persistence test - current model (${currentModelConfig?.provider}:${currentModelConfig?.modelShortName}) has thinking mode: ${currentModelConfig?.capabilities.thinking.mode}`,
        );
        return;
      }

      // Create a conversation for this test
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Thinking Content Test" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const testConversationId = createData.conversation.id;

      try {
        // Send prompt with thinking enabled
        const promptData = {
          prompt: "What is 2 + 2? Please show your thinking process.",
          conversationId: testConversationId,
          enableThinking: true,
        };

        const promptResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
          method: "POST",
          body: JSON.stringify(promptData),
        });

        expect(promptResponse.status).toBe(200);
        const promptData_response = (await promptResponse.json()) as any;

        // Verify prompt response includes thinking content
        expect(promptData_response.thinkingContent).toBeDefined();
        expect(typeof promptData_response.thinkingContent).toBe("string");
        expect(promptData_response.thinkingContent.length).toBeGreaterThan(0);

        // Retrieve conversation and check that thinking content is persisted
        const getResponse = await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "GET",
          },
        );

        expect(getResponse.status).toBe(200);
        const getData = (await getResponse.json()) as any;
        const conversation = getData.conversation;

        expect(conversation.messages).toBeDefined();
        expect(conversation.messages.length).toBeGreaterThan(0);

        // Find the assistant message
        const assistantMessage = conversation.messages.find(
          (m: any) => m.role === "assistant",
        );
        expect(assistantMessage).toBeDefined();
        expect(assistantMessage.thinkingContent).toBeDefined();
        expect(typeof assistantMessage.thinkingContent).toBe("string");
        expect(assistantMessage.thinkingContent.length).toBeGreaterThan(0);

        // Verify thinking content matches what was returned in prompt response
        expect(assistantMessage.thinkingContent).toBe(
          promptData_response.thinkingContent,
        );
      } finally {
        // Cleanup
        await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "DELETE",
          },
        );
      }
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should separate thinking content from main response in stored messages",
    async () => {
      // Skip this test if the current model doesn't support thinking
      if (!modelSupportsThinking()) {
        console.info(
          `Skipping thinking separation test - current model (${currentModelConfig?.provider}:${currentModelConfig?.modelShortName}) has thinking mode: ${currentModelConfig?.capabilities.thinking.mode}`,
        );
        return;
      }

      // Create a conversation for this test
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Thinking Separation Test" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const testConversationId = createData.conversation.id;

      try {
        // Send prompt with thinking enabled
        const promptData = {
          prompt: "Explain the process of photosynthesis.",
          conversationId: testConversationId,
          enableThinking: true,
        };

        const promptResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
          method: "POST",
          body: JSON.stringify(promptData),
        });

        expect(promptResponse.status).toBe(200);
        const _promptResponseData = (await promptResponse.json()) as any;

        // Retrieve conversation
        const getResponse = await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "GET",
          },
        );

        expect(getResponse.status).toBe(200);
        const getData = (await getResponse.json()) as any;
        const conversation = getData.conversation;

        // Find the assistant message
        const assistantMessage = conversation.messages.find(
          (m: any) => m.role === "assistant",
        );
        expect(assistantMessage).toBeDefined();

        // Verify that thinking content and main content are separate
        expect(assistantMessage.content).toBeDefined();
        expect(assistantMessage.thinkingContent).toBeDefined();
        expect(assistantMessage.content).not.toBe(
          assistantMessage.thinkingContent,
        );

        // Verify main content doesn't contain thinking tags
        expect(assistantMessage.content).not.toContain("<think>");
        expect(assistantMessage.content).not.toContain("</think>");

        // Verify thinking content doesn't contain thinking tags
        expect(assistantMessage.thinkingContent).not.toContain("<think>");
        expect(assistantMessage.thinkingContent).not.toContain("</think>");
      } finally {
        // Cleanup
        await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "DELETE",
          },
        );
      }
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should persist and retrieve tool call summaries in conversations",
    async () => {
      // Create a conversation for this test
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Tool Call Persistence Test" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const testConversationId = createData.conversation.id;

      try {
        // Send prompt that should trigger tool calls
        const promptData = {
          prompt: "Find any notes tagged with 'test' in my collection.",
          conversationId: testConversationId,
        };

        const promptResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
          method: "POST",
          body: JSON.stringify(promptData),
        });

        expect(promptResponse.status).toBe(200);
        const promptResponseData = (await promptResponse.json()) as any;

        // Only proceed if tool calls were made
        if (
          promptResponseData.toolCalls &&
          promptResponseData.toolCalls.length > 0
        ) {
          // Verify tool call structure in prompt response
          expect(Array.isArray(promptResponseData.toolCalls)).toBe(true);
          const toolCall = promptResponseData.toolCalls[0];
          expect(toolCall.functionName).toBeDefined();
          expect(typeof toolCall.functionName).toBe("string");
          expect(toolCall.executionTimeMs).toBeDefined();
          expect(typeof toolCall.executionTimeMs).toBe("number");
          expect(toolCall.success).toBeDefined();
          expect(typeof toolCall.success).toBe("boolean");

          // Retrieve conversation and check that tool calls are persisted
          const getResponse = await authenticatedFetch(
            `${BASE_URL}/conversations/${testConversationId}`,
            {
              method: "GET",
            },
          );

          expect(getResponse.status).toBe(200);
          const getData = (await getResponse.json()) as any;
          const conversation = getData.conversation;

          expect(conversation.messages).toBeDefined();
          expect(conversation.messages.length).toBeGreaterThan(0);

          // Find the assistant message
          const assistantMessage = conversation.messages.find(
            (m: any) => m.role === "assistant",
          );
          expect(assistantMessage).toBeDefined();
          expect(assistantMessage.toolCalls).toBeDefined();
          expect(Array.isArray(assistantMessage.toolCalls)).toBe(true);
          expect(assistantMessage.toolCalls.length).toBeGreaterThan(0);

          // Verify tool call data structure matches what was returned in prompt response
          const persistedToolCall = assistantMessage.toolCalls[0];
          expect(persistedToolCall.functionName).toBe(toolCall.functionName);
          expect(persistedToolCall.executionTimeMs).toBe(
            toolCall.executionTimeMs,
          );
          expect(persistedToolCall.success).toBe(toolCall.success);
        } else {
          console.info(
            "No tool calls were made in this test - this is acceptable",
          );
        }
      } finally {
        // Cleanup
        await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "DELETE",
          },
        );
      }
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should handle conversations with both thinking and tool calls",
    async () => {
      // Skip this test if the current model doesn't support thinking
      if (!modelSupportsThinking()) {
        console.info(
          `Skipping combined thinking+tools test - current model (${currentModelConfig?.provider}:${currentModelConfig?.modelShortName}) has thinking mode: ${currentModelConfig?.capabilities.thinking.mode}`,
        );
        return;
      }

      // Create a conversation for this test
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Combined Features Test" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const testConversationId = createData.conversation.id;

      try {
        // Send prompt with both thinking enabled and likely to trigger tools
        const promptData = {
          prompt:
            "I need to find my notes about machine learning. Can you help me search for them?",
          conversationId: testConversationId,
          enableThinking: true,
        };

        const promptResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
          method: "POST",
          body: JSON.stringify(promptData),
        });

        expect(promptResponse.status).toBe(200);
        const promptResponseData = (await promptResponse.json()) as any;

        // Retrieve conversation
        const getResponse = await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "GET",
          },
        );

        expect(getResponse.status).toBe(200);
        const getData = (await getResponse.json()) as any;
        const conversation = getData.conversation;

        // Find the assistant message
        const assistantMessage = conversation.messages.find(
          (m: any) => m.role === "assistant",
        );
        expect(assistantMessage).toBeDefined();

        // Verify thinking content is present and properly separated
        expect(assistantMessage.thinkingContent).toBeDefined();
        expect(typeof assistantMessage.thinkingContent).toBe("string");
        expect(assistantMessage.content).not.toContain("<think>");
        expect(assistantMessage.content).not.toContain("</think>");

        // If tool calls were made, verify they're also persisted
        if (
          promptResponseData.toolCalls &&
          promptResponseData.toolCalls.length > 0
        ) {
          expect(assistantMessage.toolCalls).toBeDefined();
          expect(Array.isArray(assistantMessage.toolCalls)).toBe(true);
          expect(assistantMessage.toolCalls.length).toBeGreaterThan(0);
        }

        // Verify both features can coexist
        expect(assistantMessage.content).toBeDefined();
        expect(assistantMessage.thinkingContent).toBeDefined();
      } finally {
        // Cleanup
        await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "DELETE",
          },
        );
      }
    },
    AI_TEST_TIMEOUT,
  );

  it(
    "should maintain backwards compatibility for conversations without thinking/tool calls",
    async () => {
      // Create a conversation for this test
      const createResponse = await authenticatedFetch(
        `${BASE_URL}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Backwards Compatibility Test" }),
        },
      );

      expect(createResponse.status).toBe(200);
      const createData = (await createResponse.json()) as any;
      const testConversationId = createData.conversation.id;

      try {
        // Send simple prompt without thinking or tool-triggering content
        const promptData = {
          prompt: "Hello, how are you today?",
          conversationId: testConversationId,
          // Explicitly disable thinking
          enableThinking: false,
        };

        const promptResponse = await authenticatedFetch(`${BASE_URL}/prompt`, {
          method: "POST",
          body: JSON.stringify(promptData),
        });

        expect(promptResponse.status).toBe(200);
        const promptResponseData = (await promptResponse.json()) as any;

        // Verify no thinking content or tool calls in response
        expect(promptResponseData.thinkingContent).toBeUndefined();
        expect(promptResponseData.toolCalls).toBeUndefined();

        // Retrieve conversation
        const getResponse = await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "GET",
          },
        );

        expect(getResponse.status).toBe(200);
        const getData = (await getResponse.json()) as any;
        const conversation = getData.conversation;

        // Find the assistant message
        const assistantMessage = conversation.messages.find(
          (m: any) => m.role === "assistant",
        );
        expect(assistantMessage).toBeDefined();

        // Verify no thinking content or tool calls are persisted
        // Note: thinkingContent may be null (from database) rather than undefined
        expect(assistantMessage.thinkingContent).toBeFalsy();
        expect(assistantMessage.toolCalls).toBeUndefined();

        // Verify basic message structure still works
        expect(assistantMessage.content).toBeDefined();
        expect(typeof assistantMessage.content).toBe("string");
        expect(assistantMessage.role).toBe("assistant");
        expect(assistantMessage.createdAt).toBeDefined();
      } finally {
        // Cleanup
        await authenticatedFetch(
          `${BASE_URL}/conversations/${testConversationId}`,
          {
            method: "DELETE",
          },
        );
      }
    },
    AI_TEST_TIMEOUT,
  );

  // --- Cleanup Tests ---

  it("DELETE /api/conversations/:id - should delete the main test conversation", async () => {
    expect(
      createdConversationId,
      "Test setup failed: createdConversationId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/conversations/${createdConversationId}`,
      {
        method: "DELETE",
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.status).toBe("OK");
    expect(data.message).toBe("Conversation deleted successfully");
  });

  it("DELETE /api/conversations/:id - should delete the second test conversation", async () => {
    if (secondConversationId) {
      const response = await authenticatedFetch(
        `${BASE_URL}/conversations/${secondConversationId}`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.status).toBe("OK");
      expect(data.message).toBe("Conversation deleted successfully");
    }
  });

  it("GET /api/conversations/:id - should return 404 for deleted conversation", async () => {
    expect(
      createdConversationId,
      "Test cleanup check requires createdConversationId",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/conversations/${createdConversationId}`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(404);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Conversation not found");
  });
});
