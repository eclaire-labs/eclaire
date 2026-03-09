import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);

describe("Tags API Integration Tests", { timeout: 30000 }, () => {
  // Ensure a note with tags exists so the query exercises the junction join
  let createdNoteId: string | null = null;

  it("POST /api/notes — seed a note with tags", async () => {
    await delay(200);
    const response = await authenticatedFetch(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: "Tag test note",
        content: "Used to seed tags for tag API tests",
        tags: ["tag-test-alpha", "tag-test-beta"],
      }),
    });
    expect(response.status).toBe(201);
    const data = await response.json();
    createdNoteId = data.id;
  });

  // ── GET /api/tags (unfiltered) ──────────────────────────────────────

  it("GET /api/tags — returns 200 with items array", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/tags`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  // ── GET /api/tags?type=<entity> ───────────────────────────────────────

  const entityTypes = [
    "bookmarks",
    "documents",
    "notes",
    "photos",
    "tasks",
  ] as const;

  for (const type of entityTypes) {
    it(`GET /api/tags?type=${type} — returns 200 (not 500)`, async () => {
      const response = await authenticatedFetch(
        `${BASE_URL}/tags?type=${type}`,
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("items");
      expect(Array.isArray(data.items)).toBe(true);
    });
  }

  it("GET /api/tags?type=notes — includes seeded tags", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/tags?type=notes`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.items).toContain("tag-test-alpha");
    expect(data.items).toContain("tag-test-beta");
  });

  it("GET /api/tags?type=notes — returns tags sorted case-insensitively", async () => {
    const response = await authenticatedFetch(`${BASE_URL}/tags?type=notes`);
    expect(response.status).toBe(200);

    const data = await response.json();
    const sorted = [...data.items].sort((a: string, b: string) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    expect(data.items).toEqual(sorted);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────

  it("DELETE /api/notes/:id — cleanup seeded note", async () => {
    if (!createdNoteId) return;
    const response = await authenticatedFetch(
      `${BASE_URL}/notes/${createdNoteId}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(200);
  });
});
