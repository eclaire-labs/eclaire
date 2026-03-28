import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Photo, PhotoListResponse } from "../utils/types.js";

/**
 * Search/filter integration tests for the photos API.
 *
 * Creates a set of photos with known properties in beforeAll, then verifies
 * that text search and combined filters return correct results.
 */

describe("Photo Search & Filter Integration Tests", { timeout: 30000 }, () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);
  const createdIds: string[] = [];

  const testPhotos = [
    {
      title: "Alpha Sunset Landscape",
      description: "Golden hour photography at the coast",
      tags: ["landscape", "sunset"],
    },
    {
      title: "Beta Portrait Session",
      description: "Studio portrait with professional lighting",
      tags: ["portrait", "studio"],
    },
    {
      title: "Gamma Street Photography",
      description: "Candid shots from the city market",
      tags: ["street", "candid"],
    },
  ];

  async function createTestPhoto(
    data: Record<string, unknown>,
  ): Promise<Photo> {
    const dummyFile = new Blob(["dummy image content"], {
      type: "image/jpeg",
    });
    const formData = new FormData();
    const metadata = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      deviceId: "vitest",
      originalFilename: `${String(data.title).toLowerCase().replace(/\s+/g, "-")}.jpg`,
    };
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("content", dummyFile, metadata.originalFilename);

    const response = await authenticatedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(201);
    const photo = (await response.json()) as Photo;
    createdIds.push(photo.id);
    return photo;
  }

  beforeAll(async () => {
    for (const data of testPhotos) {
      await createTestPhoto(data);
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await authenticatedFetch(`${BASE_URL}/photos/${id}`, {
        method: "DELETE",
      });
    }
  });

  // --- Response Shape ---

  it("should return paginated response shape", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/photos`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("limit");
    expect(data).toHaveProperty("offset");
    expect(data.items).toBeInstanceOf(Array);
  });

  // --- Text Search ---

  it("should find photos by title text search", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/photos?text=Alpha`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    const found = data.items.find((p) => p.title.includes("Alpha"));
    expect(found).toBeDefined();
    expect(found?.title).toBe("Alpha Sunset Landscape");
  });

  it("should find photos by description text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/photos?text=professional+lighting`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    const found = data.items.find((p) => p.title.includes("Beta"));
    expect(found).toBeDefined();
  });

  it("should return empty results for non-matching text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/photos?text=xyznonexistent99`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBe(0);
  });

  // --- Tag Filtering ---

  it("should filter photos by single tag", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/photos?tags=street`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    const found = data.items.find((p) => p.title.includes("Gamma"));
    expect(found).toBeDefined();

    for (const item of data.items) {
      if (createdIds.includes(item.id)) {
        expect(item.tags).toContain("street");
      }
    }
  });

  it("should filter photos by shared tag", async () => {
    // No shared tag across our test photos, but verify the query works
    const response = await authenticatedFetch(
      `${BASE_URL}/photos?tags=landscape`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    const ourItems = data.items.filter((p) => createdIds.includes(p.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems[0]?.title).toBe("Alpha Sunset Landscape");
  });

  // --- Combined Filters ---

  it("should combine text search with tag filter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/photos?text=Sunset&tags=landscape`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    const ourItems = data.items.filter((p) => createdIds.includes(p.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems[0]?.title).toBe("Alpha Sunset Landscape");
  });

  // --- Pagination ---

  it("should respect limit parameter", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/photos?limit=1`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toHaveLength(1);
    expect(data.limit).toBe(1);
    expect(data.totalCount).toBeGreaterThanOrEqual(3);
  });
});
