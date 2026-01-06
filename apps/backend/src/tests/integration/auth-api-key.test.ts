import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, DEMO_API_KEY, delay, logger } from "../utils/test-helpers.js";
import type { Bookmark } from "../utils/types.js";

// Cookie storage to ensure no session interference
let sessionCookies: string | null = null;

// Local loggedFetch for testing different authentication scenarios
const loggedFetch = async (url: string, options: RequestInit = {}) => {
  const method = options.method || "GET";
  const headers = (options.headers as Record<string, string>) || {};

  // Add Content-Type header for JSON requests
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  logger.request(method, url, headers, options.body);

  const response = await fetch(url, {
    ...options,
    headers,
  });
  await logger.response(response);

  return response;
};

describe("API Key Authentication Integration Tests", () => {
  beforeAll(async () => {
    console.log("🧪 Starting API Key authentication integration tests...");

    // Ensure we start with a clean state - no session cookies
    sessionCookies = null;

    // Sign out first to ensure no active session can interfere with API key tests
    console.log(
      "🔄 Ensuring clean state by signing out any existing session...",
    );
    try {
      await loggedFetch(`${BASE_URL}/auth/sign-out`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      // Ignore errors here, we just want to ensure clean state
      console.log("ℹ️ Sign out call completed (expected if no active session)");
    }
  });

  afterAll(async () => {
    console.log("✅ API Key authentication integration tests completed");
  });

  it("Should verify no active session exists before API key tests", async () => {
    // Ensure we have no session cookies
    expect(sessionCookies).toBeNull();

    // Verify that session-based API access fails
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      // No Authorization header, no cookies
    });

    expect(response.status).toBe(401);
    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log("✅ Confirmed no active session - ready for API key tests");
  });

  it("GET /api/bookmarks - should access authenticated API with valid API key", async () => {
    await delay(100);

    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${DEMO_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as Bookmark[];
    expect(data).toBeInstanceOf(Array);

    if (data.length > 0) {
      // Verify bookmark structure
      const firstBookmark = data[0];
      expect(firstBookmark).toBeDefined();
      expect(firstBookmark!.id).toBeTypeOf("string");
      expect(firstBookmark!.url).toBeTypeOf("string");
      expect(firstBookmark!.title).toBeTypeOf("string");
      expect(firstBookmark!.createdAt).toBeTypeOf("string");
      if (firstBookmark!.updatedAt) {
        expect(firstBookmark!.updatedAt).toBeTypeOf("string");
      }

      console.log(
        `✅ Successfully accessed API with valid API key - found ${data.length} bookmarks`,
      );
    } else {
      console.log(
        "✅ Successfully accessed API with valid API key - no bookmarks found",
      );
    }
  });

  it("POST /api/bookmarks - should create bookmark with valid API key", async () => {
    const newBookmark = {
      url: "https://api-key-test.example.com",
      title: "API Key Test Bookmark",
      description: "A bookmark created using API key authentication",
      tags: ["api-key", "test", "authentication"],
    };

    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEMO_API_KEY}`,
      },
      body: JSON.stringify(newBookmark),
    });

    expect(response.status).toBe(202); // 202 Accepted for async processing

    const data = (await response.json()) as Bookmark;
    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    expect(data.url).toBe(newBookmark.url);
    expect(data.title).toBe(newBookmark.title);
    expect(data.description).toBe(newBookmark.description);

    // Tags might be reordered, so check they contain the same elements
    expect(data.tags).toEqual(expect.arrayContaining(newBookmark.tags));
    expect(newBookmark.tags).toEqual(expect.arrayContaining(data.tags || []));

    // Verify processing status is set for async processing
    expect(data.processingStatus).toBeDefined();
    expect(["pending", "processing"]).toContain(data.processingStatus);

    console.log("✅ Successfully created bookmark with valid API key");
  });

  it("GET /api/bookmarks - should fail with empty Authorization header", async () => {
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      headers: {
        Authorization: "", // Empty authorization
      },
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log("✅ Correctly rejected empty Authorization header");
  });

  it("GET /api/bookmarks - should fail with missing Authorization header", async () => {
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      // No Authorization header at all
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log("✅ Correctly rejected missing Authorization header");
  });

  it("GET /api/bookmarks - should fail with invalid API key", async () => {
    const invalidApiKey = "invalid-api-key-123456789";

    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${invalidApiKey}`,
      },
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log("✅ Correctly rejected invalid API key");
  });

  it("GET /api/bookmarks - should fail with malformed Bearer token", async () => {
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      headers: {
        Authorization: "NotBearer invalid-format",
      },
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log("✅ Correctly rejected malformed Bearer token");
  });

  it("POST /api/bookmarks - should fail to create bookmark with invalid API key", async () => {
    const invalidApiKey = "totally-fake-api-key";
    const newBookmark = {
      url: "https://should-fail.example.com",
      title: "This Should Fail",
      description: "This bookmark creation should fail with invalid API key",
      tags: ["fail", "test"],
    };

    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${invalidApiKey}`,
      },
      body: JSON.stringify(newBookmark),
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log("✅ Correctly rejected bookmark creation with invalid API key");
  });

  it("Should verify API key works with X-API-Key header alternative", async () => {
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      headers: {
        "X-API-Key": DEMO_API_KEY, // Alternative header format
      },
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as Bookmark[];
    expect(data).toBeInstanceOf(Array);

    console.log("✅ Successfully accessed API with X-API-Key header format");
  });

  it("Should verify API key authentication doesn't create session cookies", async () => {
    // Make an API call with valid API key
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${DEMO_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    // Verify no session cookies were set
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toBeNull();

    // Verify we still don't have session cookies stored
    expect(sessionCookies).toBeNull();

    console.log(
      "✅ Confirmed API key authentication doesn't create session cookies",
    );
  });

  it("Final verification - session-based access should still fail after API key tests", async () => {
    // Attempt to access API without any authentication
    const response = await loggedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
      // No Authorization header, no cookies
    });

    expect(response.status).toBe(401);

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();

    console.log(
      "✅ Final verification: API key tests didn't create session side effects",
    );
  });
});
