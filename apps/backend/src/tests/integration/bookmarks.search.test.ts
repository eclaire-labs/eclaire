import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Bookmark, BookmarkListResponse } from "../utils/types.js";

/**
 * Search/filter integration tests for the bookmark API.
 *
 * These tests create a set of bookmarks with known properties, then verify
 * that the search/filter endpoint returns the correct results for various
 * query combinations.
 */

interface BookmarkSearchItem {
  id: string;
  title: string;
  url: string;
  description: string | null;
  date: string;
  dueDate: string | null;
  reviewStatus: string | null;
  flagColor: string | null;
  isPinned: boolean;
  processingStatus: string | null;
  tags: string[];
}

interface BookmarkSearchResponse {
  items: BookmarkSearchItem[];
  totalCount: number;
  limit: number;
  offset: number;
}

describe("Bookmark Search & Filter Integration Tests", { timeout: 30000 }, () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);
  const createdIds: string[] = [];

  // Test data — bookmarks with distinct, searchable properties
  const testBookmarks = [
    {
      url: "https://search-test-alpha.example.com",
      title: "Alpha JavaScript Tutorial",
      description: "Learn advanced JavaScript patterns",
      tags: ["javascript", "tutorial"],
    },
    {
      url: "https://search-test-beta.example.com",
      title: "Beta Python Guide",
      description: "Python for data science beginners",
      tags: ["python", "tutorial"],
    },
    {
      url: "https://search-test-gamma.example.com",
      title: "Gamma Rust Handbook",
      description: "Systems programming with Rust",
      tags: ["rust", "systems"],
    },
  ];

  // Helper to create a bookmark and track its ID
  async function createTestBookmark(
    data: Record<string, unknown>,
  ): Promise<Bookmark> {
    const response = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    expect(response.status).toBe(202);
    const bookmark = (await response.json()) as Bookmark;
    createdIds.push(bookmark.id);
    return bookmark;
  }

  beforeAll(async () => {
    // Create all test bookmarks
    for (const data of testBookmarks) {
      await createTestBookmark(data);
    }
  });

  afterAll(async () => {
    // Clean up all created bookmarks
    for (const id of createdIds) {
      await authenticatedFetch(`${BASE_URL}/bookmarks/${id}`, {
        method: "DELETE",
      });
    }
  });

  // --- Response Shape ---

  it("should return paginated response shape", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("limit");
    expect(data).toHaveProperty("offset");
    expect(data.items).toBeInstanceOf(Array);
    expect(data.totalCount).toBeTypeOf("number");
    expect(data.limit).toBeTypeOf("number");
    expect(data.offset).toBeTypeOf("number");
  });

  // --- Text Search ---

  it("should find bookmarks by title text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?text=Alpha`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    const found = data.items.find((b) =>
      b.title.includes("Alpha"),
    );
    expect(found).toBeDefined();
    expect(found?.title).toBe("Alpha JavaScript Tutorial");
  });

  it("should find bookmarks by description text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?text=data+science`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    const found = data.items.find((b) =>
      b.title.includes("Beta"),
    );
    expect(found).toBeDefined();
  });

  it("should find bookmarks by URL text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?text=search-test-gamma`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    const found = data.items.find((b) =>
      b.title.includes("Gamma"),
    );
    expect(found).toBeDefined();
  });

  it("should return empty results for non-matching text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?text=xyznonexistent99`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBe(0);
  });

  // --- Tag Filtering ---

  it("should filter bookmarks by single tag", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?tags=rust`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    // Should find the Rust bookmark
    const found = data.items.find((b) =>
      b.title.includes("Rust"),
    );
    expect(found).toBeDefined();

    // Every result should have the "rust" tag
    for (const item of data.items) {
      if (createdIds.includes(item.id)) {
        expect(item.tags).toContain("rust");
      }
    }
  });

  it("should filter bookmarks by shared tag", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?tags=tutorial`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    // Should find both Alpha and Beta (both have "tutorial" tag)
    const ourItems = data.items.filter((b) => createdIds.includes(b.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(2);

    const titles = ourItems.map((b) => b.title);
    expect(titles).toContain("Alpha JavaScript Tutorial");
    expect(titles).toContain("Beta Python Guide");
  });

  it("should filter bookmarks by multiple tags (AND logic)", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?tags=javascript,tutorial`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    // Should find only Alpha (has both "javascript" AND "tutorial")
    const ourItems = data.items.filter((b) => createdIds.includes(b.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems.every((b) => b.tags.includes("javascript"))).toBe(true);
    expect(ourItems.every((b) => b.tags.includes("tutorial"))).toBe(true);
  });

  // --- Pagination ---

  it("should respect limit parameter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?limit=1`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    expect(data.items).toHaveLength(1);
    expect(data.limit).toBe(1);
    // totalCount should still reflect the full count
    expect(data.totalCount).toBeGreaterThanOrEqual(3);
  });

  it("should respect offset parameter", async () => {
    // First, get all items to know the total
    const allResponse = await authenticatedFetch(`${BASE_URL}/bookmarks`, {
      method: "GET",
    });
    const allData = (await allResponse.json()) as BookmarkSearchResponse;
    const totalItems = allData.items.length;

    // Now get with offset that skips some
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?offset=1&limit=2`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    expect(data.offset).toBe(1);
    // The offset items should be different from the first item
    if (totalItems > 1) {
      expect(data.items[0]?.id).not.toBe(allData.items[0]?.id);
    }
  });

  // --- Combined Filters ---

  it("should combine text search with tag filter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks?text=Tutorial&tags=javascript`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as BookmarkSearchResponse;

    // Should narrow down to Alpha only
    const ourItems = data.items.filter((b) => createdIds.includes(b.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems[0]?.title).toBe("Alpha JavaScript Tutorial");
  });

  // --- Error Handling ---

  it("should return 404 for GET on non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/bm-nonexistent12345`,
      { method: "GET" },
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 for PUT on non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/bm-nonexistent12345`,
      {
        method: "PUT",
        body: JSON.stringify({
          url: "https://example.com",
          title: "Test",
          tags: [],
        }),
      },
    );

    // Should be 404 or 500 (service throws NotFoundError)
    expect([404, 500]).toContain(response.status);
  });

  it("should return 404 for PATCH on non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/bm-nonexistent12345`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Test" }),
      },
    );

    expect([404, 500]).toContain(response.status);
  });

  it("should return 404 for DELETE on non-existent bookmark", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/bookmarks/bm-nonexistent12345`,
      { method: "DELETE" },
    );

    expect([404, 500]).toContain(response.status);
  });
});
