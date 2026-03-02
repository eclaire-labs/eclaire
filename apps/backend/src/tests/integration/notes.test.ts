import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
  TEST_API_KEY_2,
} from "../utils/test-helpers.js";
import type { Note, NoteListResponse } from "../utils/types.js";

const fetchUser1 = createAuthenticatedFetch(TEST_API_KEY);
const fetchUser2 = createAuthenticatedFetch(TEST_API_KEY_2);

// ---------------------------------------------------------------------------
// CRUD & Core Functionality
// ---------------------------------------------------------------------------

describe("Notes API Integration Tests", { timeout: 30000 }, () => {
  let createdNoteId: string | null = null;

  const initialNoteData = {
    title: "Test Note Entry",
    content: "This is the initial content.",
    tags: ["test", "integration"],
  };
  const updatedNoteData = {
    title: "Updated Test Note Entry",
    content: "This is the updated content.",
    tags: ["test", "updated"],
  };

  // Helper — throws early if the POST test didn't succeed
  const ensureNoteCreated = (): string => {
    if (createdNoteId) return createdNoteId;
    throw new Error(
      "Note was not created in the POST test. Check the POST test for failures.",
    );
  };

  // --- Create ---

  it("POST /api/notes — should create a new note", async () => {
    await delay(200);

    const response = await fetchUser1(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify(initialNoteData),
    });

    expect(response.status).toBe(201);

    const data = (await response.json()) as Note;

    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    expect(data.id).toMatch(/^note-[A-Za-z0-9]{15}$/);
    expect(data.title).toBe(initialNoteData.title);
    expect(data.content).toBe(initialNoteData.content);
    expect(data.description).toBeTypeOf("string");
    expect(data.tags).toEqual(expect.arrayContaining(initialNoteData.tags));
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");
    expect(data.processingStatus).toBeTypeOf("string");
    // Default values
    expect(data.reviewStatus).toBe("pending");
    expect(data.flagColor).toBeNull();
    expect(data.isPinned).toBe(false);
    expect(data.dueDate).toBeNull();

    createdNoteId = data.id;
  });

  // --- Read single ---

  it("GET /api/notes/:id — should retrieve the created note", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}`);

    expect(response.status).toBe(200);

    const data = (await response.json()) as Note;

    expect(data.id).toBe(noteId);
    expect(data.title).toBe(initialNoteData.title);
    expect(data.content).toBe(initialNoteData.content);
    expect(data.description).toBeTypeOf("string");
    expect(data.tags).toEqual(expect.arrayContaining(initialNoteData.tags));
    expect(data.reviewStatus).toBe("pending");
    expect(data.flagColor).toBeNull();
    expect(data.isPinned).toBe(false);
  });

  // --- Read list ---

  it("GET /api/notes — should list notes including the new one", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes`);

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteListResponse;

    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.totalCount).toBeGreaterThan(0);
    expect(data.limit).toBeTypeOf("number");
    expect(data.offset).toBeTypeOf("number");

    const found = data.items.find((n) => n.id === noteId);
    expect(found, `Note ${noteId} not found in list`).toBeDefined();
    expect(found?.title).toBe(initialNoteData.title);
  });

  // --- Full update (PUT) ---

  it("PUT /api/notes/:id — should update the note", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(updatedNoteData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as Note;

    expect(data.id).toBe(noteId);
    expect(data.title).toBe(updatedNoteData.title);
    expect(data.content).toBe(updatedNoteData.content);
    expect(data.tags).toEqual(expect.arrayContaining(updatedNoteData.tags));
  });

  // --- Partial update (PATCH) ---

  it("PATCH /api/notes/:id — should partially update the note", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Partially Updated Title" }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as Note;

    expect(data.id).toBe(noteId);
    expect(data.title).toBe("Partially Updated Title");
    // Content should be preserved from the PUT above
    expect(data.content).toBe(updatedNoteData.content);
  });

  // --- Description auto-generation ---

  it("POST /api/notes — should auto-generate description from content", async () => {
    const longContent = "A".repeat(120);
    const response = await fetchUser1(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: "Description Test Note",
        content: longContent,
        tags: ["desc-test"],
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Note;

    // Description should be first 100 chars + "..."
    expect(data.description).toBe(`${"A".repeat(100)}...`);

    // Clean up
    await fetchUser1(`${BASE_URL}/notes/${data.id}`, { method: "DELETE" });
  });

  // --- Review status ---

  it("PATCH /api/notes/:id/review — should update review status to accepted", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus: "accepted" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.id).toBe(noteId);
    expect(data.reviewStatus).toBe("accepted");
  });

  it("PATCH /api/notes/:id/review — should update review status to rejected", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus: "rejected" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.reviewStatus).toBe("rejected");
  });

  it("PATCH /api/notes/:id/review — should transition back to pending", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus: "pending" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.reviewStatus).toBe("pending");
  });

  // --- Flag color ---

  it("PATCH /api/notes/:id/flag — should set flag color", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/flag`, {
      method: "PATCH",
      body: JSON.stringify({ flagColor: "red" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.flagColor).toBe("red");
  });

  it("PATCH /api/notes/:id/flag — should remove flag color with null", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/flag`, {
      method: "PATCH",
      body: JSON.stringify({ flagColor: null }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.flagColor).toBeNull();
  });

  // --- Pin ---

  it("PATCH /api/notes/:id/pin — should pin the note", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ isPinned: true }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.isPinned).toBe(true);
  });

  it("PATCH /api/notes/:id/pin — should unpin the note", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ isPinned: false }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.isPinned).toBe(false);
  });

  // --- Delete ---

  it("DELETE /api/notes/:id — should delete the note", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
  });

  it("GET /api/notes/:id — should return 404 after deletion", async () => {
    const noteId = ensureNoteCreated();

    const response = await fetchUser1(`${BASE_URL}/notes/${noteId}`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Due Date Functionality
// ---------------------------------------------------------------------------

describe("Notes — Due Date Functionality", { timeout: 30000 }, () => {
  let dueDateNoteId: string | null = null;

  it("POST /api/notes — should create a note with due date", async () => {
    await delay(200);

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const response = await fetchUser1(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: "Note with Due Date",
        content: "This note has a due date",
        tags: ["due-date", "test"],
        dueDate: dueDate.toISOString(),
      }),
    });

    expect(response.status).toBe(201);

    const data = (await response.json()) as Note;
    expect(data.dueDate).not.toBeNull();
    const timeDiff = Math.abs(
      new Date(data.dueDate!).getTime() - dueDate.getTime(),
    );
    expect(timeDiff).toBeLessThan(1000); // Within 1 second (SQLite precision)

    dueDateNoteId = data.id;
  });

  it("PATCH /api/notes/:id — should update due date", async () => {
    expect(dueDateNoteId).not.toBeNull();

    const newDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const response = await fetchUser1(`${BASE_URL}/notes/${dueDateNoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: newDueDate.toISOString() }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as Note;
    expect(data.dueDate).not.toBeNull();
    const timeDiff = Math.abs(
      new Date(data.dueDate!).getTime() - newDueDate.getTime(),
    );
    expect(timeDiff).toBeLessThan(1000);
  });

  it("PATCH /api/notes/:id — should clear due date with null", async () => {
    expect(dueDateNoteId).not.toBeNull();

    const response = await fetchUser1(`${BASE_URL}/notes/${dueDateNoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: null }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Note;
    expect(data.dueDate).toBeNull();
  });

  it("GET /api/notes — should find notes by due date range", async () => {
    // Re-set a due date for range searching
    const testDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await fetchUser1(`${BASE_URL}/notes/${dueDateNoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: testDueDate.toISOString() }),
    });

    const startDate = new Date().toISOString();
    const endDate = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const response = await fetchUser1(
      `${BASE_URL}/notes?dueDateStart=${encodeURIComponent(startDate)}&dueDateEnd=${encodeURIComponent(endDate)}`,
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteListResponse;
    const found = data.items.find((n) => n.id === dueDateNoteId);
    expect(found).toBeDefined();
  });

  afterAll(async () => {
    if (dueDateNoteId) {
      await fetchUser1(`${BASE_URL}/notes/${dueDateNoteId}`, {
        method: "DELETE",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Error Handling & Validation
// ---------------------------------------------------------------------------

describe("Notes — Error Handling", { timeout: 30000 }, () => {
  it("POST /api/notes — should return 400 when title is missing", async () => {
    const response = await fetchUser1(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: "No title provided" }),
    });

    expect(response.status).toBe(400);
  });

  it("GET /api/notes/:id — should return 404 for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345`,
    );

    expect(response.status).toBe(404);
  });

  it("PUT /api/notes/:id — should return error for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345`,
      {
        method: "PUT",
        body: JSON.stringify({
          title: "Ghost",
          content: "Does not exist",
          tags: [],
        }),
      },
    );

    expect([404, 500]).toContain(response.status);
  });

  it("PATCH /api/notes/:id — should return error for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Ghost" }),
      },
    );

    expect([404, 500]).toContain(response.status);
  });

  it("DELETE /api/notes/:id — should return error for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345`,
      { method: "DELETE" },
    );

    expect([404, 500]).toContain(response.status);
  });

  it("PATCH /api/notes/:id/review — should return 404 for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345/review`,
      {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "accepted" }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("PATCH /api/notes/:id/flag — should return 404 for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345/flag`,
      {
        method: "PATCH",
        body: JSON.stringify({ flagColor: "red" }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("PATCH /api/notes/:id/pin — should return 404 for non-existent note", async () => {
    const response = await fetchUser1(
      `${BASE_URL}/notes/note-nonexistent12345/pin`,
      {
        method: "PATCH",
        body: JSON.stringify({ isPinned: true }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("PATCH /api/notes/:id/review — should return 400 for invalid review status", async () => {
    // Create a note to test with
    const createResponse = await fetchUser1(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: "Error Handling Test Note",
        content: "Test content",
        tags: ["error-test"],
      }),
    });

    expect(createResponse.status).toBe(201);
    const createdNote = (await createResponse.json()) as Note;

    const response = await fetchUser1(
      `${BASE_URL}/notes/${createdNote.id}/review`,
      {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "invalid-status" }),
      },
    );

    expect(response.status).toBe(400);

    // Clean up
    await fetchUser1(`${BASE_URL}/notes/${createdNote.id}`, {
      method: "DELETE",
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-user Isolation
// ---------------------------------------------------------------------------

describe("Notes — Multi-user Isolation", { timeout: 30000 }, () => {
  let user1NoteId: string | null = null;

  beforeAll(async () => {
    const response = await fetchUser1(`${BASE_URL}/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: "User 1 Private Note",
        content: "This should not be visible to user 2",
        tags: ["isolation-test"],
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Note;
    user1NoteId = data.id;
  });

  it("should not allow user 2 to GET user 1's note", async () => {
    expect(user1NoteId).not.toBeNull();

    const response = await fetchUser2(`${BASE_URL}/notes/${user1NoteId}`);

    // Should be 404 — user 2 has no access
    expect(response.status).toBe(404);
  });

  it("should not include user 1's note in user 2's list", async () => {
    expect(user1NoteId).not.toBeNull();

    const response = await fetchUser2(`${BASE_URL}/notes`);
    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteListResponse;
    const found = data.items.find((n) => n.id === user1NoteId);
    expect(found).toBeUndefined();
  });

  it("should not allow user 2 to PATCH user 1's note", async () => {
    expect(user1NoteId).not.toBeNull();

    const response = await fetchUser2(`${BASE_URL}/notes/${user1NoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hacked" }),
    });

    expect([404, 500]).toContain(response.status);
  });

  it("should not allow user 2 to DELETE user 1's note", async () => {
    expect(user1NoteId).not.toBeNull();

    const response = await fetchUser2(`${BASE_URL}/notes/${user1NoteId}`, {
      method: "DELETE",
    });

    expect([404, 500]).toContain(response.status);

    // Verify the note still exists for user 1
    const verifyResponse = await fetchUser1(`${BASE_URL}/notes/${user1NoteId}`);
    expect(verifyResponse.status).toBe(200);
  });

  afterAll(async () => {
    if (user1NoteId) {
      await fetchUser1(`${BASE_URL}/notes/${user1NoteId}`, {
        method: "DELETE",
      });
    }
  });
});
