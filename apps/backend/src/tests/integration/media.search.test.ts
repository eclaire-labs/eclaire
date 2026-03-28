import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Media, MediaListResponse } from "../utils/types.js";

/**
 * Search/filter integration tests for the media API.
 *
 * Creates a set of media items with known properties in beforeAll, then verifies
 * that text search and combined filters return correct results.
 *
 * This test also validates the fix for the media searchVector bug where
 * null was passed instead of media.searchVector on PostgreSQL/PGlite.
 */

describe("Media Search & Filter Integration Tests", { timeout: 30000 }, () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);
  const createdIds: string[] = [];

  const testMedia = [
    {
      title: "Alpha Podcast Episode",
      description: "Interview about machine learning trends",
      tags: ["podcast", "ml"],
    },
    {
      title: "Beta Conference Talk",
      description: "Keynote speech on distributed systems",
      tags: ["conference", "talk"],
    },
    {
      title: "Gamma Music Recording",
      description: "Live jazz performance at the downtown club",
      tags: ["music", "live"],
    },
  ];

  async function createTestMedia(
    data: Record<string, unknown>,
  ): Promise<Media> {
    const dummyFile = new Blob(["dummy audio content"], {
      type: "audio/mpeg",
    });
    const formData = new FormData();
    const metadata = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      originalFilename: `${String(data.title).toLowerCase().replace(/\s+/g, "-")}.mp3`,
    };
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("content", dummyFile, metadata.originalFilename);

    const response = await authenticatedFetch(`${BASE_URL}/media`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(201);
    const media = (await response.json()) as Media;
    createdIds.push(media.id);
    return media;
  }

  beforeAll(async () => {
    for (const data of testMedia) {
      await createTestMedia(data);
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await authenticatedFetch(`${BASE_URL}/media/${id}`, {
        method: "DELETE",
      });
    }
  });

  // --- Response Shape ---

  it("should return paginated response shape", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/media`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("limit");
    expect(data).toHaveProperty("offset");
    expect(data.items).toBeInstanceOf(Array);
  });

  // --- Text Search ---

  it("should find media by title text search", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/media?text=Alpha`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    const found = data.items.find((m) => m.title.includes("Alpha"));
    expect(found).toBeDefined();
    expect(found?.title).toBe("Alpha Podcast Episode");
  });

  it("should find media by description text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/media?text=distributed+systems`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    const found = data.items.find((m) => m.title.includes("Beta"));
    expect(found).toBeDefined();
  });

  it("should return empty results for non-matching text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/media?text=xyznonexistent99`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBe(0);
  });

  // --- Tag Filtering ---

  it("should filter media by single tag", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/media?tags=music`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    const found = data.items.find((m) => m.title.includes("Gamma"));
    expect(found).toBeDefined();

    for (const item of data.items) {
      if (createdIds.includes(item.id)) {
        expect(item.tags).toContain("music");
      }
    }
  });

  // --- Combined Filters ---

  it("should combine text search with tag filter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/media?text=Podcast&tags=ml`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    const ourItems = data.items.filter((m) => createdIds.includes(m.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems[0]?.title).toBe("Alpha Podcast Episode");
  });

  // --- Pagination ---

  it("should respect limit parameter", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/media?limit=1`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MediaListResponse;

    expect(data.items).toHaveLength(1);
    expect(data.limit).toBe(1);
    expect(data.totalCount).toBeGreaterThanOrEqual(3);
  });
});
