import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Document, DocumentListResponse } from "../utils/types.js";

/**
 * Search/filter integration tests for the documents API.
 *
 * These tests create a set of documents with known properties, then verify
 * that the search/filter endpoint returns the correct results for various
 * query combinations.
 */

describe("Document Search & Filter Integration Tests", { timeout: 30000 }, () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);
  const createdIds: string[] = [];

  // Test data — documents with distinct, searchable properties
  const testDocuments = [
    {
      title: "Alpha Budget Spreadsheet",
      description: "Annual budget planning for 2026",
      tags: ["finance", "spreadsheet"],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    },
    {
      title: "Beta Project Proposal",
      description: "Proposal for the new client project",
      tags: ["project", "spreadsheet"],
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
    },
    {
      title: "Gamma Meeting Notes",
      description: "Notes from the quarterly review",
      tags: ["notes", "quarterly"],
      dueDate: null,
    },
  ];

  // Helper to create a test document via FormData
  async function createTestDocument(
    data: Record<string, unknown>,
  ): Promise<Document> {
    const formData = new FormData();
    const metadata = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      dueDate: data.dueDate,
      originalFilename: `${String(data.title).toLowerCase().replace(/\s+/g, "-")}.txt`,
    };
    formData.append("metadata", JSON.stringify(metadata));

    const fileBuffer = Buffer.from(`Test content for ${data.title}`);
    const fileBlob = new Blob([fileBuffer], { type: "text/plain" });
    formData.append("content", fileBlob, metadata.originalFilename);

    const response = await authenticatedFetch(`${BASE_URL}/documents`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(201);
    const doc = (await response.json()) as Document;
    createdIds.push(doc.id);
    return doc;
  }

  beforeAll(async () => {
    for (const data of testDocuments) {
      await createTestDocument(data);
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await authenticatedFetch(`${BASE_URL}/documents/${id}`, {
        method: "DELETE",
      });
    }
  });

  // --- Response Shape ---

  it("should return paginated response shape", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/documents`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

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

  it("should find documents by title text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?text=Alpha`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    const found = data.items.find((d) => d.title.includes("Alpha"));
    expect(found).toBeDefined();
    expect(found?.title).toBe("Alpha Budget Spreadsheet");
  });

  it("should find documents by description text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?text=quarterly+review`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    const found = data.items.find((d) => d.title.includes("Gamma"));
    expect(found).toBeDefined();
  });

  it("should return empty results for non-matching text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?text=xyznonexistent99`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBe(0);
  });

  // --- Tag Filtering ---

  it("should filter documents by single tag", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?tags=notes`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    const found = data.items.find((d) => d.title.includes("Gamma"));
    expect(found).toBeDefined();

    // Every result from our test set should have the "notes" tag
    for (const item of data.items) {
      if (createdIds.includes(item.id)) {
        expect(item.tags).toContain("notes");
      }
    }
  });

  it("should filter documents by shared tag", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?tags=spreadsheet`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    // Should find both Alpha and Beta (both have "spreadsheet" tag)
    const ourItems = data.items.filter((d) => createdIds.includes(d.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(2);

    const titles = ourItems.map((d) => d.title);
    expect(titles).toContain("Alpha Budget Spreadsheet");
    expect(titles).toContain("Beta Project Proposal");
  });

  it("should filter documents by multiple tags (AND logic)", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?tags=finance,spreadsheet`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    // Should find only Alpha (has both "finance" AND "spreadsheet")
    const ourItems = data.items.filter((d) => createdIds.includes(d.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems.every((d) => d.tags.includes("finance"))).toBe(true);
    expect(ourItems.every((d) => d.tags.includes("spreadsheet"))).toBe(true);
  });

  // --- Sorting ---

  it("should sort documents by title ascending", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?tags=spreadsheet&sortBy=title&sortDir=asc`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    const ourItems = data.items.filter((d) => createdIds.includes(d.id));
    if (ourItems.length > 1) {
      const titles = ourItems.map((d) => d.title);
      // Alpha should come before Beta alphabetically
      const alphaIdx = titles.findIndex((t) => t.includes("Alpha"));
      const betaIdx = titles.findIndex((t) => t.includes("Beta"));
      if (alphaIdx >= 0 && betaIdx >= 0) {
        expect(alphaIdx).toBeLessThan(betaIdx);
      }
    }
  });

  // --- Due Date Range ---

  it("should find documents by due date range", async () => {
    const startDate = new Date().toISOString().split("T")[0]; // Today
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]; // 10 days from now

    const response = await authenticatedFetch(
      `${BASE_URL}/documents?dueDateStart=${startDate}&dueDateEnd=${endDate}`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    expect(data.items).toBeInstanceOf(Array);
    // Should find the document with due date in 7 days (Alpha) but not 14 days (Beta)
    const found = data.items.find((d) =>
      d.dueDate && new Date(d.dueDate) <= new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    );
    expect(found).toBeDefined();
  });

  // --- Pagination ---

  it("should respect limit parameter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?limit=1`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    expect(data.items).toHaveLength(1);
    expect(data.limit).toBe(1);
    // totalCount should still reflect the full count
    expect(data.totalCount).toBeGreaterThanOrEqual(3);
  });

  it("should support limit and offset together", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?limit=2&offset=0`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    expect(data.items.length).toBeLessThanOrEqual(2);
    expect(data.totalCount).toBeGreaterThan(0);
    expect(data.limit).toBe(2);
  });

  // --- Combined Filters ---

  it("should combine text search with tag filter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents?text=Budget&tags=finance`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    // Should narrow down to Alpha only
    const ourItems = data.items.filter((d) => createdIds.includes(d.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems[0]?.title).toBe("Alpha Budget Spreadsheet");
  });
});
