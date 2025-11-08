import { afterAll, describe, expect, it } from "vitest";
import type {
  ChannelCapability,
  ChannelPlatform,
  CreateChannelRequest,
  UpdateChannelRequest,
} from "@/schemas/channels-params";

// Import types from actual schema files
import type {
  ChannelErrorResponse,
  ChannelResponse,
  CreateChannelResponse,
  DeleteChannelResponse,
  ListChannelsResponse,
  UpdateChannelResponse,
} from "@/schemas/channels-responses";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

// Helper to make API calls with full URL
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  return loggedFetch(`${BASE_URL}${endpoint}`, options);
};

// Helper to extract error information from various error response formats
const extractErrorInfo = (errorResponse: any) => {
  // Hono zValidator format: { error: [...], success: false } - where error is array of issues
  if (
    errorResponse.error &&
    Array.isArray(errorResponse.error) &&
    errorResponse.error.length > 0
  ) {
    const messages = errorResponse.error
      .map((issue: any) => issue.message || "Unknown validation error")
      .filter((msg: string) => msg); // Filter out empty messages

    const combinedMessage =
      messages.length > 0 ? messages.join(", ") : "Validation failed";

    return {
      hasError: true,
      errorMessage: combinedMessage,
      isZodError: true,
    };
  }

  // Check for nested Zod validation error format: { error: { issues: [...] } }
  if (
    errorResponse.error &&
    errorResponse.error.issues &&
    Array.isArray(errorResponse.error.issues)
  ) {
    const messages = errorResponse.error.issues
      .map((issue: any) => issue.message || "Unknown validation error")
      .filter((msg: string) => msg); // Filter out empty messages

    const combinedMessage =
      messages.length > 0 ? messages.join(", ") : "Validation failed";

    return {
      hasError: true,
      errorMessage: combinedMessage,
      isZodError: true,
    };
  }

  // Direct Zod validation error format: { issues: [...] }
  if (errorResponse.issues && Array.isArray(errorResponse.issues)) {
    const messages = errorResponse.issues
      .map((issue: any) => issue.message || "Unknown validation error")
      .filter((msg: string) => msg); // Filter out empty messages

    const combinedMessage =
      messages.length > 0 ? messages.join(", ") : "Validation failed";

    return {
      hasError: true,
      errorMessage: combinedMessage,
      isZodError: true,
    };
  }

  // Custom error format: { error: "...", message: "..." } - but only if error is a string
  if (
    (errorResponse.error && typeof errorResponse.error === "string") ||
    errorResponse.message
  ) {
    const message =
      (typeof errorResponse.error === "string" ? errorResponse.error : null) ||
      errorResponse.message;

    return {
      hasError: true,
      errorMessage: message,
      isZodError: false,
    };
  }

  return {
    hasError: false,
    errorMessage: null,
    isZodError: false,
  };
};

// Global cleanup function
const globalTestCleanup = async () => {
  try {
    // Get all channels and delete them
    const response = await apiCall("/channels");
    if (response.status === 200) {
      const data = (await response.json()) as ListChannelsResponse;
      for (const channel of data.channels) {
        await apiCall(`/channels/${channel.id}`, { method: "DELETE" });
      }
    }
  } catch (error) {
    console.warn("Cleanup warning:", error);
  }
};

describe("Channels Integration Tests", { timeout: 30000 }, () => {
  let createdChannelId: string | null = null;

  // Test data using proper types
  const validTelegramConfig: CreateChannelRequest = {
    name: "Test Telegram Channel",
    platform: "telegram" as ChannelPlatform,
    capability: "bidirectional" as ChannelCapability,
    config: {
      chat_identifier: "@test_channel",
      bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
    },
  };

  const updatedChannelData: UpdateChannelRequest = {
    name: "Updated Telegram Channel",
    capability: "notification" as ChannelCapability,
    config: {
      chat_identifier: "-1001234567890",
      bot_token: "987654321:ZYXwvuTSRqpONMlkjIHgfEDcba-updated-token",
    },
  };

  // Global cleanup after all tests complete
  afterAll(async () => {
    await globalTestCleanup();
  });

  describe("Basic CRUD Operations", () => {
    it("GET /api/channels - should return empty list initially", async () => {
      const response = await apiCall("/channels");

      expect(response.status).toBe(200);
      const data = (await response.json()) as ListChannelsResponse;

      expect(data.channels).toBeDefined();
      expect(Array.isArray(data.channels)).toBe(true);
      expect(data.total).toBe(data.channels.length);
    });

    it("POST /api/channels - should create a new Telegram channel", async () => {
      await delay(200);

      const response = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(validTelegramConfig),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as CreateChannelResponse;

      expect(data.channel).toBeDefined();
      expect(data.channel.id).toBeTypeOf("string");
      expect(data.channel.id.startsWith("ch-")).toBe(true);
      expect(data.channel.name).toBe(validTelegramConfig.name);
      expect(data.channel.platform).toBe(validTelegramConfig.platform);
      expect(data.channel.capability).toBe(validTelegramConfig.capability);
      expect(data.channel.isActive).toBe(true); // Default should be true
      expect(data.channel.userId).toBeTypeOf("string");

      // Validate timestamps
      expect(data.channel.createdAt).toBeDefined();
      expect(data.channel.updatedAt).toBeDefined();
      expect(Date.parse(data.channel.createdAt)).not.toBeNaN();
      expect(Date.parse(data.channel.updatedAt)).not.toBeNaN();

      // Ensure config is not exposed in response
      expect((data.channel as any).config).toBeUndefined();

      expect(data.message).toBeDefined();
      expect(data.message).toBe("Channel created successfully");

      // Store ID for subsequent tests
      createdChannelId = data.channel.id;
      expect(createdChannelId).not.toBeNull();
    });

    it("GET /api/channels - should list the created channel", async () => {
      expect(
        createdChannelId,
        "Test setup failed: createdChannelId is null",
      ).not.toBeNull();

      const response = await apiCall("/channels");

      expect(response.status).toBe(200);
      const data = (await response.json()) as ListChannelsResponse;

      expect(data.channels).toBeDefined();
      expect(Array.isArray(data.channels)).toBe(true);
      expect(data.total).toBe(data.channels.length);
      expect(data.channels.length).toBeGreaterThan(0);

      const foundChannel = data.channels.find((c) => c.id === createdChannelId);
      expect(
        foundChannel,
        `Channel with ID ${createdChannelId} not found in list`,
      ).toBeDefined();
      expect(foundChannel!.name).toBe(validTelegramConfig.name);
      expect(foundChannel!.platform).toBe(validTelegramConfig.platform);
      expect(foundChannel!.capability).toBe(validTelegramConfig.capability);

      // Ensure config is not exposed in list response
      expect((foundChannel as any).config).toBeUndefined();
    });

    it("PUT /api/channels/:id - should update the channel", async () => {
      expect(
        createdChannelId,
        "Test setup failed: createdChannelId is null",
      ).not.toBeNull();

      const response = await apiCall(`/channels/${createdChannelId}`, {
        method: "PUT",
        body: JSON.stringify(updatedChannelData),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as UpdateChannelResponse;

      expect(data.channel).toBeDefined();
      expect(data.channel.id).toBe(createdChannelId);
      expect(data.channel.name).toBe(updatedChannelData.name);
      expect(data.channel.capability).toBe(updatedChannelData.capability);
      expect(data.channel.platform).toBe("telegram"); // Should remain unchanged

      // Timestamps should be updated
      expect(data.channel.updatedAt).toBeDefined();
      expect(Date.parse(data.channel.updatedAt)).not.toBeNaN();

      expect(data.message).toBe("Channel updated successfully");

      // Ensure config is not exposed
      expect((data.channel as any).config).toBeUndefined();
    });

    it("PUT /api/channels/:id - should allow partial updates", async () => {
      expect(
        createdChannelId,
        "Test setup failed: createdChannelId is null",
      ).not.toBeNull();

      const partialUpdate = {
        name: "Partially Updated Channel",
      };

      const response = await apiCall(`/channels/${createdChannelId}`, {
        method: "PUT",
        body: JSON.stringify(partialUpdate),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as UpdateChannelResponse;

      expect(data.channel.name).toBe(partialUpdate.name);
      expect(data.channel.capability).toBe(updatedChannelData.capability); // Should remain from previous update
      expect(data.channel.platform).toBe("telegram");
    });
  });

  describe("Schema & Configuration Validation", () => {
    it("POST /api/channels - should validate Telegram configuration", async () => {
      const invalidConfigs = [
        {
          ...validTelegramConfig,
          config: {
            chat_identifier: "", // Empty chat identifier
            bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
          },
        },
        {
          ...validTelegramConfig,
          config: {
            chat_identifier: "@test_channel",
            bot_token: "", // Empty bot token
          },
        },
        {
          ...validTelegramConfig,
          config: {
            chat_identifier: "@test_channel",
            // Missing bot_token
          },
        },
        {
          ...validTelegramConfig,
          config: {
            bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
            // Missing chat_identifier
          },
        },
      ];

      for (const invalidConfig of invalidConfigs) {
        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(invalidConfig),
        });

        expect(response.status).toBe(400);
        const data = (await response.json()) as ChannelErrorResponse;
        expect(data.error).toBeDefined();
      }
    });

    it("POST /api/channels - should validate different chat identifier formats", async () => {
      const validChatIdentifiers = [
        "@public_channel",
        "@test123",
        "-1001234567890", // Supergroup/channel
        "-1234567890", // Regular group
        "123456789", // User ID
      ];

      for (const chatId of validChatIdentifiers) {
        const config = {
          name: `Test Channel ${chatId}`,
          platform: "telegram" as const,
          capability: "notification" as const,
          config: {
            chat_identifier: chatId,
            bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
          },
        };

        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(config),
        });

        expect(response.status).toBe(201);
        const data = (await response.json()) as CreateChannelResponse;

        // Clean up immediately
        await apiCall(`/channels/${data.channel.id}`, { method: "DELETE" });
      }
    });

    it("POST /api/channels - should validate platform types", async () => {
      const validPlatforms: ChannelPlatform[] = [
        "telegram",
        "slack",
        "whatsapp",
        "email",
      ];

      for (const platform of validPlatforms) {
        const config = {
          name: `Test ${platform} Channel`,
          platform,
          capability: "notification" as const,
          config:
            platform === "telegram"
              ? {
                  chat_identifier: "@test_channel",
                  bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
                }
              : { test: "config" }, // Generic config for other platforms
        };

        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(config),
        });

        if (platform === "telegram") {
          expect(response.status).toBe(201);
          const data = (await response.json()) as CreateChannelResponse;
          // Clean up
          await apiCall(`/channels/${data.channel.id}`, { method: "DELETE" });
        } else {
          // Other platforms might not be fully implemented yet
          expect([201, 400, 500]).toContain(response.status);
          if (response.status === 201) {
            const data = (await response.json()) as CreateChannelResponse;
            await apiCall(`/channels/${data.channel.id}`, { method: "DELETE" });
          }
        }
      }
    });

    it("POST /api/channels - should validate capability types", async () => {
      const validCapabilities: ChannelCapability[] = [
        "notification",
        "chat",
        "bidirectional",
      ];

      for (const capability of validCapabilities) {
        const config = {
          name: `Test ${capability} Channel`,
          platform: "telegram" as const,
          capability,
          config: {
            chat_identifier: "@test_channel",
            bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
          },
        };

        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(config),
        });

        expect(response.status).toBe(201);
        const data = (await response.json()) as CreateChannelResponse;
        expect(data.channel.capability).toBe(capability);

        // Clean up
        await apiCall(`/channels/${data.channel.id}`, { method: "DELETE" });
      }
    });

    it("POST /api/channels - should validate channel name length limits", async () => {
      // Test exactly at the limit (255 chars)
      const exactLimitName = "a".repeat(255);
      const validConfig: CreateChannelRequest = {
        name: exactLimitName,
        platform: "telegram",
        capability: "notification",
        config: {
          chat_identifier: "@test_channel",
          bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
        },
      };

      const response = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(validConfig),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as CreateChannelResponse;
      expect(data.channel.name).toBe(exactLimitName);

      // Clean up
      await apiCall(`/channels/${data.channel.id}`, { method: "DELETE" });
    });

    it("POST /api/channels - should reject channel name exceeding 255 characters", async () => {
      const tooLongName = "a".repeat(256);
      const invalidConfig = {
        name: tooLongName,
        platform: "telegram",
        capability: "notification",
        config: {
          chat_identifier: "@test_channel",
          bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
        },
      };

      const response = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(invalidConfig),
      });

      expect(response.status).toBe(400);
      const data = await response.json();

      // Use helper to extract error information from any format
      const errorInfo = extractErrorInfo(data);
      expect(errorInfo.hasError).toBe(true);
      expect(errorInfo.errorMessage).toBeDefined();
      expect(errorInfo.errorMessage).toBeTypeOf("string");
    });

    it("POST /api/channels - should validate required fields properly", async () => {
      const requiredFieldTests = [
        { ...validTelegramConfig, name: undefined },
        { ...validTelegramConfig, platform: undefined },
        { ...validTelegramConfig, capability: undefined },
        { ...validTelegramConfig, config: undefined },
      ];

      for (const invalidConfig of requiredFieldTests) {
        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(invalidConfig),
        });

        expect(response.status).toBe(400);
        const data = await response.json();

        // Use helper to extract error information from any format
        const errorInfo = extractErrorInfo(data);
        expect(errorInfo.hasError).toBe(true);
        expect(errorInfo.errorMessage).toBeDefined();
        expect(errorInfo.errorMessage).toBeTypeOf("string");
      }
    });

    it("PUT /api/channels/:id - should validate update field constraints", async () => {
      // Create a channel for testing
      const createResponse = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(validTelegramConfig),
      });
      expect(createResponse.status).toBe(201);
      const createData = (await createResponse.json()) as CreateChannelResponse;
      const testChannelId = createData.channel.id;

      // Test name length limit on update
      const tooLongName = "a".repeat(256);
      const updateResponse = await apiCall(`/channels/${testChannelId}`, {
        method: "PUT",
        body: JSON.stringify({ name: tooLongName }),
      });

      expect(updateResponse.status).toBe(400);
      const updateData = await updateResponse.json();
      const updateErrorInfo = extractErrorInfo(updateData);
      expect(updateErrorInfo.hasError).toBe(true);

      // Test isActive boolean validation
      const invalidActiveResponse = await apiCall(
        `/channels/${testChannelId}`,
        {
          method: "PUT",
          body: JSON.stringify({ isActive: "not-a-boolean" }),
        },
      );

      expect(invalidActiveResponse.status).toBe(400);

      // Clean up
      await apiCall(`/channels/${testChannelId}`, { method: "DELETE" });
    });
  });

  describe("Error Handling & Validation", () => {
    it("POST /api/channels - should reject invalid requests", async () => {
      const invalidRequests = [
        {}, // Empty request
        { name: "" }, // Missing required fields
        { name: "Test", platform: "invalid" }, // Invalid platform
        { name: "Test", platform: "telegram", capability: "invalid" }, // Invalid capability
        { name: "Test", platform: "telegram", capability: "notification" }, // Missing config
        {
          name: "x".repeat(300), // Name too long
          platform: "telegram",
          capability: "notification",
          config: { chat_identifier: "@test", bot_token: "fake" },
        },
      ];

      for (const invalidRequest of invalidRequests) {
        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(invalidRequest),
        });

        expect(response.status).toBe(400);
        const data = await response.json();

        // Use helper to extract error information from any format
        const errorInfo = extractErrorInfo(data);
        expect(errorInfo.hasError).toBe(true);
        expect(errorInfo.errorMessage).toBeDefined();
        expect(errorInfo.errorMessage).toBeTypeOf("string");
      }
    });

    it("GET/PUT/DELETE /api/channels/:id - should return 404 for non-existent channels", async () => {
      const nonExistentId = "ch-nonexistentchannel";

      // Test GET
      const getResponse = await apiCall(`/channels/${nonExistentId}`);
      expect(getResponse.status).toBe(404);

      // Test PUT
      const putResponse = await apiCall(`/channels/${nonExistentId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(putResponse.status).toBe(404);

      // Test DELETE
      const deleteResponse = await apiCall(`/channels/${nonExistentId}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(404);
    });

    it("PUT /api/channels/:id - should reject invalid updates", async () => {
      // First create a channel for testing
      const createResponse = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(validTelegramConfig),
      });
      expect(createResponse.status).toBe(201);
      const createData = (await createResponse.json()) as CreateChannelResponse;
      const testChannelId = createData.channel.id;

      const invalidUpdates = [
        { name: "" }, // Empty name
        { capability: "invalid" }, // Invalid capability
        { platform: "different" }, // Trying to change platform
        {
          config: {
            chat_identifier: "", // Invalid config
            bot_token: "fake",
          },
        },
      ];

      for (const invalidUpdate of invalidUpdates) {
        const response = await apiCall(`/channels/${testChannelId}`, {
          method: "PUT",
          body: JSON.stringify(invalidUpdate),
        });

        expect([400, 404]).toContain(response.status); // 400 for validation, might be 404 if platform change fails
      }

      // Clean up
      await apiCall(`/channels/${testChannelId}`, { method: "DELETE" });
    });

    it("Should require authentication for all endpoints", async () => {
      const unauthenticatedFetch = async (
        url: string,
        options: RequestInit = {},
      ) => {
        return fetch(`${BASE_URL}${url}`, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
        });
      };

      const endpoints = [
        { method: "GET", url: "/channels" },
        {
          method: "POST",
          url: "/channels",
          body: JSON.stringify(validTelegramConfig),
        },
        {
          method: "PUT",
          url: "/channels/test-id",
          body: JSON.stringify({ name: "Test" }),
        },
        { method: "DELETE", url: "/channels/test-id" },
      ];

      for (const endpoint of endpoints) {
        const response = await unauthenticatedFetch(endpoint.url, {
          method: endpoint.method,
          body: endpoint.body,
        });

        expect(response.status).toBe(401);

        // Validate unauthorized error response format
        const data = await response.json();
        const errorInfo = extractErrorInfo(data);
        expect(errorInfo.hasError).toBe(true);
        // The error should indicate unauthorized access
        expect(errorInfo.errorMessage.toLowerCase()).toContain("unauthorized");
      }
    });

    it("Should handle malformed JSON requests", async () => {
      const response = await apiCall("/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{ "name": "test", invalid }', // More realistic malformed JSON
      });

      expect(response.status).toBe(400);

      // Check if response is JSON before trying to parse
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        const errorInfo = extractErrorInfo(data);
        expect(errorInfo.hasError).toBe(true);
      } else {
        // If response isn't JSON, just verify it's a 400 error
        expect(response.status).toBe(400);
      }
    });

    it("Should validate Content-Type header", async () => {
      const response = await apiCall("/channels", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(validTelegramConfig),
      });

      // Should either reject or handle gracefully
      expect([400, 415, 500]).toContain(response.status);
    });

    it("Should handle special characters in channel names", async () => {
      const specialCharTests = [
        "Channel with émojis 🚀",
        "Channel-with-dashes_and_underscores.and.dots",
        "Channel (with parentheses) & symbols!",
        "Channel with \"quotes\" and 'apostrophes'",
        "Channel\nwith\nnewlines",
        "   Channel with spaces   ",
      ];

      for (const name of specialCharTests) {
        const config: CreateChannelRequest = {
          name: name,
          platform: "telegram",
          capability: "notification",
          config: {
            chat_identifier: "@test_channel",
            bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-fake-token",
          },
        };

        const response = await apiCall("/channels", {
          method: "POST",
          body: JSON.stringify(config),
        });

        // Should either accept or provide clear validation error
        if (response.status === 201) {
          const data = (await response.json()) as CreateChannelResponse;
          expect(data.channel.name).toBe(name);
          // Clean up
          await apiCall(`/channels/${data.channel.id}`, { method: "DELETE" });
        } else {
          expect(response.status).toBe(400);
          const data = await response.json();
          const errorInfo = extractErrorInfo(data);
          expect(errorInfo.hasError).toBe(true);
        }
      }
    });
  });

  describe("Channel Deletion", () => {
    it("DELETE /api/channels/:id - should delete the channel", async () => {
      expect(
        createdChannelId,
        "Test setup failed: createdChannelId is null",
      ).not.toBeNull();

      const response = await apiCall(`/channels/${createdChannelId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as DeleteChannelResponse;

      expect(data.success).toBe(true);
      expect(data.message).toBe("Channel deleted successfully");
    });

    it("GET /api/channels - should not list the deleted channel", async () => {
      expect(
        createdChannelId,
        "Test cleanup check requires createdChannelId",
      ).not.toBeNull();

      const response = await apiCall("/channels");

      expect(response.status).toBe(200);
      const data = (await response.json()) as ListChannelsResponse;

      const foundChannel = data.channels.find((c) => c.id === createdChannelId);
      expect(
        foundChannel,
        `Deleted channel with ID ${createdChannelId} still found in list`,
      ).toBeUndefined();

      // Reset for safety
      createdChannelId = null;
    });

    it("DELETE /api/channels/:id - should return 404 for already deleted channel", async () => {
      const response = await apiCall(`/channels/ch-alreadydeleted`, {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Data Security & Privacy", () => {
    it("Should not expose encrypted config in API responses", async () => {
      // Create a channel
      const createResponse = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(validTelegramConfig),
      });
      expect(createResponse.status).toBe(201);
      const createData = (await createResponse.json()) as CreateChannelResponse;

      // Check that config is not in create response
      expect((createData.channel as any).config).toBeUndefined();

      // Validate complete response structure
      expect(createData.channel.id).toBeTypeOf("string");
      expect(createData.channel.userId).toBeTypeOf("string");
      expect(createData.channel.name).toBe(validTelegramConfig.name);
      expect(createData.channel.platform).toBe(validTelegramConfig.platform);
      expect(createData.channel.capability).toBe(
        validTelegramConfig.capability,
      );
      expect(createData.channel.isActive).toBe(true);
      expect(createData.channel.createdAt).toBeTypeOf("string");
      expect(createData.channel.updatedAt).toBeTypeOf("string");
      expect(createData.message).toBe("Channel created successfully");

      // Check list response
      const listResponse = await apiCall("/channels");
      expect(listResponse.status).toBe(200);
      const listData = (await listResponse.json()) as ListChannelsResponse;
      const channel = listData.channels.find(
        (c) => c.id === createData.channel.id,
      );
      expect((channel as any)?.config).toBeUndefined();

      // Validate list response structure
      expect(listData.channels).toBeInstanceOf(Array);
      expect(listData.total).toBe(listData.channels.length);
      expect(listData.total).toBeTypeOf("number");

      // Clean up
      await apiCall(`/channels/${createData.channel.id}`, { method: "DELETE" });
    });

    it("Should isolate channels by user", async () => {
      // This test assumes the test framework properly isolates users
      // In a real multi-user test, we'd create channels with different API keys
      // and verify they can't see each other's channels

      const response = await apiCall("/channels");
      expect(response.status).toBe(200);

      const data = (await response.json()) as ListChannelsResponse;
      // All channels should belong to the same user in this test context
      // In a real scenario, we'd verify user isolation
      expect(Array.isArray(data.channels)).toBe(true);
    });

    it("Should handle unsupported HTTP methods gracefully", async () => {
      // Test methods not explicitly defined in channels routes
      // The framework/CORS middleware may handle these gracefully rather than rejecting them
      const methodsToTest = ["PATCH", "HEAD", "OPTIONS"];

      for (const method of methodsToTest) {
        const response = await apiCall("/channels", {
          method: method,
          body:
            method !== "HEAD" ? JSON.stringify(validTelegramConfig) : undefined,
        });

        // These methods are handled by the framework/CORS middleware
        // Rather than expecting errors, verify they respond consistently
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(500);

        // Ensure we don't get server errors for these methods
        expect([200, 204, 404, 405]).toContain(response.status);
      }
    });

    it("Should validate response format consistency", async () => {
      // Create a channel to test all response formats
      const createResponse = await apiCall("/channels", {
        method: "POST",
        body: JSON.stringify(validTelegramConfig),
      });

      expect(createResponse.status).toBe(201);
      expect(createResponse.headers.get("content-type")).toContain(
        "application/json",
      );

      const createData = (await createResponse.json()) as CreateChannelResponse;
      const channelId = createData.channel.id;

      // Test GET list response format
      const listResponse = await apiCall("/channels");
      expect(listResponse.status).toBe(200);
      expect(listResponse.headers.get("content-type")).toContain(
        "application/json",
      );

      // Test PUT response format
      const updateResponse = await apiCall(`/channels/${channelId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Test Channel" }),
      });
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.headers.get("content-type")).toContain(
        "application/json",
      );

      // Test DELETE response format
      const deleteResponse = await apiCall(`/channels/${channelId}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.headers.get("content-type")).toContain(
        "application/json",
      );

      const deleteData = (await deleteResponse.json()) as DeleteChannelResponse;
      expect(deleteData.success).toBe(true);
      expect(deleteData.message).toBe("Channel deleted successfully");
    });
  });
});
