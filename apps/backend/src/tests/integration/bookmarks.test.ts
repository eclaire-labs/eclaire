import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  hasSameElements,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Bookmark } from "../utils/types.js";

describe("Bookmark API Integration Tests", () => {
  let createdBookmarkId: string | null = null;
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);

  // Updated to use CreateBookmarkSchema structure for requests
  const initialBookmarkData = {
    url: "https://example.com",
    title: "Example Website",
    description: "An example website for testing",
    tags: ["test", "example"],
  };

  // Expected response structure (with defaults from database schema)
  const expectedInitialResponse = {
    ...initialBookmarkData,
    reviewStatus: null, // Database schema: no default (null)
    flagColor: null, // Database schema: no default (null)
    isPinned: false, // Database schema: .default(false)
    dueDate: null, // Database schema: no default (null)
  };

  const updatedBookmarkData = {
    url: "https://updated-example.com",
    title: "Updated Example Website",
    description: "An updated example website for testing",
    tags: ["test", "example", "updated"],
    reviewStatus: "accepted" as const,
    flagColor: "green" as const,
    isPinned: true,
    dueDate: "2025-12-31T23:59:59.000Z", // Backend returns with milliseconds
  };

  // --- Test Sequence ---

  it("POST /api/bookmarks - should create a new bookmark", async () => {
    await delay(200);
    const response = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify(initialBookmarkData),
    });

    expect(response.status).toBe(202); // Expect 'Accepted' for async processing

    const data = (await response.json()) as Bookmark;

    // Save ID first, even if assertions fail
    createdBookmarkId = data.id;
    expect(createdBookmarkId).not.toBeNull();

    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    // Check that the ID follows the 'bm-' format with 15-character nanoid
    expect(data.id).toMatch(/^bm-[A-Za-z0-9]{15}$/);
    expect(data.url).toBe(initialBookmarkData.url);
    expect(data.title).toBe(initialBookmarkData.title);
    expect(data.description).toBe(initialBookmarkData.description);
    expect(hasSameElements(data.tags, initialBookmarkData.tags)).toBe(true);

    // Verify new fields are set correctly (using expected defaults from backend)
    expect(data.reviewStatus).toBe(expectedInitialResponse.reviewStatus);
    expect(data.flagColor).toBe(expectedInitialResponse.flagColor);
    expect(data.isPinned).toBe(expectedInitialResponse.isPinned);
    expect(data.dueDate).toBe(expectedInitialResponse.dueDate);

    // Verify processing status is set for async processing
    expect(data.processingStatus).toBeDefined();
    expect(["pending", "processing"]).toContain(data.processingStatus);
  });

  it("GET /api/bookmarks/:id - should retrieve the created bookmark", async () => {
    expect(
      createdBookmarkId,
      "Test setup failed: createdBookmarkId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/${createdBookmarkId}`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as Bookmark;

    expect(data).toBeDefined();
    expect(data.id).toBe(createdBookmarkId);
    expect(data.url).toBe(initialBookmarkData.url);
    expect(data.title).toBe(initialBookmarkData.title);
    expect(data.description).toBe(initialBookmarkData.description);
    expect(hasSameElements(data.tags, initialBookmarkData.tags)).toBe(true);
    expect(data.reviewStatus).toBe(expectedInitialResponse.reviewStatus);
    expect(data.flagColor).toBe(expectedInitialResponse.flagColor);
    expect(data.isPinned).toBe(expectedInitialResponse.isPinned);
    expect(data.dueDate).toBe(expectedInitialResponse.dueDate);
  });

  it("GET /api/bookmarks - should list bookmarks including the new one", async () => {
    expect(
      createdBookmarkId,
      "Test setup failed: createdBookmarkId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Bookmark[];

    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);

    const found = data.find((b) => b.id === createdBookmarkId);
    expect(
      found,
      `Bookmark with ID ${createdBookmarkId} not found in the list`,
    ).toBeDefined();
    expect(found?.url).toBe(initialBookmarkData.url);
    expect(found?.title).toBe(initialBookmarkData.title);
    expect(found?.reviewStatus).toBe(expectedInitialResponse.reviewStatus);
    expect(found?.flagColor).toBe(expectedInitialResponse.flagColor);
    expect(found?.isPinned).toBe(expectedInitialResponse.isPinned);
    expect(found?.dueDate).toBe(expectedInitialResponse.dueDate);
    expect(found?.processingStatus).toBeDefined();
    expect(["pending", "processing", "completed", "failed"]).toContain(
      found?.processingStatus,
    );
  });

  it("PUT /api/bookmarks/:id - should update the bookmark", async () => {
    expect(
      createdBookmarkId,
      "Test setup failed: createdBookmarkId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/${createdBookmarkId}`,
      {
        method: "PUT",
        body: JSON.stringify(updatedBookmarkData),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as Bookmark;

    expect(data).toBeDefined();
    expect(data.id).toBe(createdBookmarkId);
    expect(data.url).toBe(updatedBookmarkData.url);
    expect(data.title).toBe(updatedBookmarkData.title);
    expect(data.description).toBe(updatedBookmarkData.description);
    // Check tags content, not order
    expect(hasSameElements(data.tags, updatedBookmarkData.tags)).toBe(true);
    expect(data.reviewStatus).toBe(updatedBookmarkData.reviewStatus);
    expect(data.flagColor).toBe(updatedBookmarkData.flagColor);
    expect(data.isPinned).toBe(updatedBookmarkData.isPinned);
    expect(data.dueDate).toBe(updatedBookmarkData.dueDate);
  });

  it("GET /api/bookmarks/:id - should retrieve the updated bookmark", async () => {
    expect(
      createdBookmarkId,
      "Test setup failed: createdBookmarkId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/${createdBookmarkId}`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as Bookmark;

    expect(data).toBeDefined();
    expect(data.id).toBe(createdBookmarkId);
    expect(data.url).toBe(updatedBookmarkData.url);
    expect(data.title).toBe(updatedBookmarkData.title);
    expect(data.description).toBe(updatedBookmarkData.description);
    // Check tags content, not order
    expect(hasSameElements(data.tags, updatedBookmarkData.tags)).toBe(true);
    expect(data.reviewStatus).toBe(updatedBookmarkData.reviewStatus);
    expect(data.flagColor).toBe(updatedBookmarkData.flagColor);
    expect(data.isPinned).toBe(updatedBookmarkData.isPinned);
    expect(data.dueDate).toBe(updatedBookmarkData.dueDate);
  });

  it("DELETE /api/bookmarks/:id - should delete the bookmark", async () => {
    expect(
      createdBookmarkId,
      "Test setup failed: createdBookmarkId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/${createdBookmarkId}`,
      {
        method: "DELETE",
      },
    );

    expect(response.status).toBe(204);
  });

  it("GET /api/bookmarks/:id - should return 404 for the deleted bookmark", async () => {
    expect(
      createdBookmarkId,
      "Test cleanup check requires createdBookmarkId",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/${createdBookmarkId}`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(404); // Expect Not Found
  });

  it("GET /api/bookmarks - should not list the deleted bookmark", async () => {
    expect(
      createdBookmarkId,
      "Test cleanup check requires createdBookmarkId",
    ).not.toBeNull();

    const response = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Bookmark[];

    expect(data).toBeInstanceOf(Array);
    const found = data.find((b) => b.id === createdBookmarkId);
    expect(
      found,
      `Deleted bookmark with ID ${createdBookmarkId} should not be in the list`,
    ).toBeUndefined();
  });

  // --- New Feature Tests ---

  it("PATCH /api/bookmarks/:id/review - should update review status", async () => {
    // Create a new bookmark for this test
    const createResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://review-test.com",
        title: "Review Test",
        description: "Testing review functionality",
        tags: ["review", "test"],
      }),
    });

    expect(createResponse.status).toBe(202);
    const createdBookmark = (await createResponse.json()) as Bookmark;
    const bookmarkId = createdBookmark.id;

    try {
      // Update review status to accepted
      const reviewResponse = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ reviewStatus: "accepted" }),
        },
      );

      expect(reviewResponse.status).toBe(200);
      const updatedBookmark = (await reviewResponse.json()) as Bookmark;
      expect(updatedBookmark.reviewStatus).toBe("accepted");
      expect(updatedBookmark.id).toBe(bookmarkId);
    } finally {
      // Cleanup
      await authenticatedFetch(`${BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    }
  });

  it("PATCH /api/bookmarks/:id/flag - should update flag color", async () => {
    // Create a new bookmark for this test
    const createResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://flag-test.com",
        title: "Flag Test",
        description: "Testing flag functionality",
        tags: ["flag", "test"],
      }),
    });

    expect(createResponse.status).toBe(202);
    const createdBookmark = (await createResponse.json()) as Bookmark;
    const bookmarkId = createdBookmark.id;

    try {
      // Update flag color to red
      const flagResponse = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/flag`,
        {
          method: "PATCH",
          body: JSON.stringify({ flagColor: "red" }),
        },
      );

      expect(flagResponse.status).toBe(200);
      const updatedBookmark = (await flagResponse.json()) as Bookmark;
      expect(updatedBookmark.flagColor).toBe("red");
      expect(updatedBookmark.id).toBe(bookmarkId);

      // Remove flag by setting to null
      const unflagResponse = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/flag`,
        {
          method: "PATCH",
          body: JSON.stringify({ flagColor: null }),
        },
      );

      expect(unflagResponse.status).toBe(200);
      const unflaggedBookmark = (await unflagResponse.json()) as Bookmark;
      expect(unflaggedBookmark.flagColor).toBeNull();
    } finally {
      // Cleanup
      await authenticatedFetch(`${BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    }
  });

  it("PATCH /api/bookmarks/:id/pin - should update pin status", async () => {
    // Create a new bookmark for this test
    const createResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://pin-test.com",
        title: "Pin Test",
        description: "Testing pin functionality",
        tags: ["pin", "test"],
      }),
    });

    expect(createResponse.status).toBe(202);
    const createdBookmark = (await createResponse.json()) as Bookmark;
    const bookmarkId = createdBookmark.id;

    try {
      // Pin the bookmark
      const pinResponse = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify({ isPinned: true }),
        },
      );

      expect(pinResponse.status).toBe(200);
      const pinnedBookmark = (await pinResponse.json()) as Bookmark;
      expect(pinnedBookmark.isPinned).toBe(true);
      expect(pinnedBookmark.id).toBe(bookmarkId);

      // Unpin the bookmark
      const unpinResponse = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify({ isPinned: false }),
        },
      );

      expect(unpinResponse.status).toBe(200);
      const unpinnedBookmark = (await unpinResponse.json()) as Bookmark;
      expect(unpinnedBookmark.isPinned).toBe(false);
    } finally {
      // Cleanup
      await authenticatedFetch(`${BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    }
  });

  it("PATCH /api/bookmarks/:id - should support partial updates with new fields", async () => {
    // Create a new bookmark for this test
    const createResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://partial-test.com",
        title: "Partial Test",
        description: "Testing partial updates",
        tags: ["partial", "test"],
      }),
    });

    expect(createResponse.status).toBe(202);
    const createdBookmark = (await createResponse.json()) as Bookmark;
    const bookmarkId = createdBookmark.id;

    try {
      // Partial update with new fields
      const partialUpdate = {
        description: "Updated description via PATCH",
        reviewStatus: "accepted" as const,
        flagColor: "blue" as const,
        isPinned: true,
        dueDate: "2025-06-15T09:00:00.000Z", // Backend returns with milliseconds
      };

      const patchResponse = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}`,
        {
          method: "PATCH",
          body: JSON.stringify(partialUpdate),
        },
      );

      expect(patchResponse.status).toBe(200);
      const updatedBookmark = (await patchResponse.json()) as Bookmark;

      // Verify partial update worked
      expect(updatedBookmark.description).toBe(partialUpdate.description);
      expect(updatedBookmark.reviewStatus).toBe(partialUpdate.reviewStatus);
      expect(updatedBookmark.flagColor).toBe(partialUpdate.flagColor);
      expect(updatedBookmark.isPinned).toBe(partialUpdate.isPinned);
      expect(updatedBookmark.dueDate).toBe(partialUpdate.dueDate);

      // Verify unchanged fields remain the same
      expect(updatedBookmark.title).toBe("Partial Test");
      expect(updatedBookmark.url).toBe("https://partial-test.com");
      expect(hasSameElements(updatedBookmark.tags, ["partial", "test"])).toBe(
        true,
      );
    } finally {
      // Cleanup
      await authenticatedFetch(`${BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    }
  });

  // --- Asset Endpoint Tests ---

  it("GET /api/bookmarks/:id/favicon - should return 404 for non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/non-existent-id/favicon`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(404);
  });

  it("GET /api/bookmarks/:id/screenshot - should return 404 for non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/non-existent-id/screenshot`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(404);
  });

  it("GET /api/bookmarks/:id/content - should return 404 for non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/non-existent-id/content`,
      {
        method: "GET",
      },
    );

    expect(response.status).toBe(404);
  });

  // --- Validation Error Tests ---

  it("POST /api/bookmarks - should return validation error for invalid URL", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "not-a-valid-url",
        title: "Invalid URL Test",
      }),
    });

    expect(response.status).toBe(400);
    const error = await response.json();
    expect((error as any).error).toBeDefined();
  });

  it("PATCH /api/bookmarks/:id/review - should return validation error for invalid review status", async () => {
    // Create a bookmark first
    const createResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://validation-test.com",
        title: "Validation Test",
      }),
    });

    expect(createResponse.status).toBe(202);
    const createdBookmark = (await createResponse.json()) as Bookmark;
    const bookmarkId = createdBookmark.id;

    try {
      const response = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ reviewStatus: "invalid-status" }),
        },
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect((error as any).error).toBeDefined();
    } finally {
      // Cleanup
      await authenticatedFetch(`${BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    }
  });

  it("PATCH /api/bookmarks/:id/flag - should return validation error for invalid flag color", async () => {
    // Create a bookmark first
    const createResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://flag-validation-test.com",
        title: "Flag Validation Test",
      }),
    });

    expect(createResponse.status).toBe(202);
    const createdBookmark = (await createResponse.json()) as Bookmark;
    const bookmarkId = createdBookmark.id;

    try {
      const response = await authenticatedFetch(
        `${BASE_URL}/bookmarks/${bookmarkId}/flag`,
        {
          method: "PATCH",
          body: JSON.stringify({ flagColor: "invalid-color" }),
        },
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect((error as any).error).toBeDefined();
    } finally {
      // Cleanup
      await authenticatedFetch(`${BASE_URL}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    }
  });
});
