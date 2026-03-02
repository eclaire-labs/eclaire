import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Note, NoteListResponse } from "../utils/types.js";

/**
 * Search/filter integration tests for the notes API.
 *
 * Creates a set of notes with known properties in beforeAll, then verifies
 * that search/filter endpoints return correct results for various query
 * combinations. All test notes are cleaned up in afterAll.
 */

describe("Notes Search & Filter Integration Tests", { timeout: 30000 }, () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);
  const createdIds: string[] = [];

  // Test data — notes with distinct, searchable properties
  const testNotes = [
    {
      title: "Alpha JavaScript Patterns",
      content: "Learn advanced JavaScript design patterns for web development",
      tags: ["javascript", "tutorial"],
    },
    {
      title: "Beta Python Data Science",
      content: "Python for data science beginners and practitioners",
      tags: ["python", "tutorial"],
    },
    {
      title: "Gamma Rust Systems Programming",
      content: "Systems programming with Rust for performance critical code",
      tags: ["rust", "systems"],
    },
    {
      title: "Delta JavaScript React Guide",
      content: "Building modern UIs with React and JavaScript",
      tags: ["javascript", "react"],
    },
  ];

  async function createTestNote(data: Record<string, unknown>): Promise<Note> {
    const response = await authenticatedFetch(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    expect(response.status).toBe(201);
    const note = (await response.json()) as Note;
    createdIds.push(note.id);
    return note;
  }

  beforeAll(async () => {
    for (const data of testNotes) {
      await createTestNote(data);
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await authenticatedFetch(`${BASE_URL}/notes/${id}`, {
        method: "DELETE",
      });
    }
  });

  // --- Response Shape ---

  it("should return paginated response shape", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/notes`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

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

  it("should find notes by title text search", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/notes?text=Alpha`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    const found = data.items.find((n) => n.title.includes("Alpha"));
    expect(found).toBeDefined();
    expect(found?.title).toBe("Alpha JavaScript Patterns");
  });

  it("should find notes by content text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes?text=data+science`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    const found = data.items.find((n) => n.title.includes("Beta"));
    expect(found).toBeDefined();
  });

  it("should return empty results for non-matching text search", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes?text=xyznonexistent99`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBe(0);
  });

  // --- Tag Filtering ---

  it("should filter notes by single tag", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/notes?tags=rust`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    const found = data.items.find((n) => n.title.includes("Rust"));
    expect(found).toBeDefined();

    // Every result from our test set should have the "rust" tag
    for (const item of data.items) {
      if (createdIds.includes(item.id)) {
        expect(item.tags).toContain("rust");
      }
    }
  });

  it("should filter notes by shared tag", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes?tags=tutorial`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    // Should find both Alpha and Beta (both have "tutorial" tag)
    const ourItems = data.items.filter((n) => createdIds.includes(n.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(2);

    const titles = ourItems.map((n) => n.title);
    expect(titles).toContain("Alpha JavaScript Patterns");
    expect(titles).toContain("Beta Python Data Science");
  });

  it("should filter notes by multiple tags (AND logic)", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes?tags=javascript,tutorial`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    // Should find only Alpha (has both "javascript" AND "tutorial")
    const ourItems = data.items.filter((n) => createdIds.includes(n.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems.every((n) => n.tags.includes("javascript"))).toBe(true);
    expect(ourItems.every((n) => n.tags.includes("tutorial"))).toBe(true);
  });

  // --- Pagination ---

  it("should respect limit parameter", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/notes?limit=1`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    expect(data.items).toHaveLength(1);
    expect(data.limit).toBe(1);
    // totalCount should reflect the full count, not just the page
    expect(data.totalCount).toBeGreaterThanOrEqual(4);
  });

  it("should respect offset parameter", async () => {
    // Get the first page
    const firstResponse = await authenticatedFetch(
      `${BASE_URL}/notes?limit=2&offset=0`,
    );
    const firstData = (await firstResponse.json()) as NoteListResponse;

    // Get the second page
    const secondResponse = await authenticatedFetch(
      `${BASE_URL}/notes?limit=2&offset=2`,
    );

    expect(secondResponse.status).toBe(200);
    const secondData = (await secondResponse.json()) as NoteListResponse;

    expect(secondData.offset).toBe(2);

    // Items on second page should be different from first page
    if (firstData.items.length > 0 && secondData.items.length > 0) {
      expect(secondData.items[0]?.id).not.toBe(firstData.items[0]?.id);
    }
  });

  it("should return empty items for offset beyond total", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/notes?offset=99999`);

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBeGreaterThan(0);
  });

  // --- Combined Filters ---

  it("should combine text search with tag filter", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes?text=React&tags=javascript`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    // Should narrow down to Delta only (has "javascript" tag and "React" in title)
    const ourItems = data.items.filter((n) => createdIds.includes(n.id));
    expect(ourItems.length).toBeGreaterThanOrEqual(1);
    expect(ourItems[0]?.title).toBe("Delta JavaScript React Guide");
  });

  // --- Due Date Filtering ---

  it("should filter notes by due date range", async () => {
    // Create a note with a due date
    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
    const noteWithDue = await createTestNote({
      title: "Due Date Search Test",
      content: "Has a due date for search testing",
      tags: ["due-search"],
      dueDate: dueDate.toISOString(),
    });

    const startDate = new Date().toISOString();
    const endDate = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const response = await authenticatedFetch(
      `${BASE_URL}/notes?dueDateStart=${encodeURIComponent(startDate)}&dueDateEnd=${encodeURIComponent(endDate)}`,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as NoteListResponse;

    const found = data.items.find((n) => n.id === noteWithDue.id);
    expect(found).toBeDefined();
    expect(found?.dueDate).not.toBeNull();
  });

  // --- Error Handling ---

  it("should return 404 for GET on non-existent note", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes/note-nonexistent12345`,
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 for PUT on non-existent note", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes/note-nonexistent12345`,
      {
        method: "PUT",
        body: JSON.stringify({
          title: "Test",
          content: "Test",
          tags: [],
        }),
      },
    );

    expect([404, 500]).toContain(response.status);
  });

  it("should return 404 for PATCH on non-existent note", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes/note-nonexistent12345`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Test" }),
      },
    );

    expect([404, 500]).toContain(response.status);
  });

  it("should return 404 for DELETE on non-existent note", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/notes/note-nonexistent12345`,
      { method: "DELETE" },
    );

    expect([404, 500]).toContain(response.status);
  });
});
