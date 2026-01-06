import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import { Note } from "../utils/types.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

// Notes API response interface matching the actual schema
interface NoteEntry {
  id: string; // ID is a string (UUID based on schema)
  title: string;
  content: string;
  description: string; // Auto-generated excerpt from content
  tags: string[]; // Array of tag names
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  processingStatus: string; // Processing status
  dueDate: string | null; // Due date in ISO format or null
  reviewStatus: "pending" | "accepted" | "rejected"; // Review status
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null; // Flag color
  isPinned: boolean; // Pin status
  originalMimeType?: string | null; // Original MIME type if uploaded
  fileSize?: number | null; // File size in bytes if uploaded
  metadata?: Record<string, any> | null; // Additional metadata
}

describe("Notes API Integration Tests", () => {
  let createdNoteId: string | null = null;

  // Helper function to ensure we have a created note
  const ensureNoteCreated = async (): Promise<string> => {
    if (createdNoteId) {
      return createdNoteId;
    }
    throw new Error(
      "Note was not created in the POST test. Check the POST test for failures.",
    );
  };
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

  // --- Test Sequence ---

  it("POST /api/notes - should create a new note entry", async () => {
    await delay(200);

    // Prepare note data as JSON (matching the new JSON API)
    const noteData = {
      title: initialNoteData.title,
      content: initialNoteData.content,
      tags: initialNoteData.tags,
    };

    const response = await loggedFetch(`${BASE_URL}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(noteData),
    });

    expect(response.status).toBe(201); // Expect 'Created'

    const data = (await response.json()) as NoteEntry;

    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    expect(data.id).toMatch(/^note-[A-Za-z0-9]{15}$/);
    expect(data.title).toBe(initialNoteData.title);
    expect(data.content).toBe(initialNoteData.content);
    expect(data.description).toBeTypeOf("string");
    expect(data.tags).toEqual(expect.arrayContaining(initialNoteData.tags));
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.processingStatus).toBeTypeOf("string");
    expect(data.reviewStatus).toBe("pending"); // Default value
    expect(data.flagColor).toBeNull(); // Default value
    expect(data.isPinned).toBe(false); // Default value
    expect(data.dueDate).toBeNull(); // Not set in this test

    createdNoteId = data.id;
    expect(createdNoteId).not.toBeNull();

    console.log(`✅ Note created successfully with ID: ${createdNoteId}`);
  });

  it("GET /api/notes/:id - should retrieve the created note entry", async () => {
    const noteId = await ensureNoteCreated();

    const response = await loggedFetch(`${BASE_URL}/notes/${noteId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;

    expect(data).toBeDefined();
    expect(data.id).toBe(noteId);
    expect(data.title).toBe(initialNoteData.title);
    expect(data.content).toBe(initialNoteData.content);
    expect(data.description).toBeTypeOf("string");
    expect(data.tags).toEqual(expect.arrayContaining(initialNoteData.tags));
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");
    expect(data.processingStatus).toBeTypeOf("string");
    expect(data.reviewStatus).toBe("pending");
    expect(data.flagColor).toBeNull();
    expect(data.isPinned).toBe(false);
  });

  it("GET /api/notes - should list note entries including the new one", async () => {
    const noteId = await ensureNoteCreated();

    const response = await loggedFetch(`${BASE_URL}/notes`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    const responseData = (await response.json()) as any;
    const data: NoteEntry[] = responseData.entries || responseData;

    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);

    const found = data.find((n) => n.id === noteId);
    expect(found, `Note with ID ${noteId} not found in the list`).toBeDefined();
    expect(found?.title).toBe(initialNoteData.title);
  });

  it("PUT /api/notes/:id - should update the note entry", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const response = await loggedFetch(`${BASE_URL}/notes/${createdNoteId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(updatedNoteData),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;

    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.title).toBe(updatedNoteData.title);
    expect(data.content).toBe(updatedNoteData.content);
    expect(data.description).toBeTypeOf("string");
    expect(data.tags).toEqual(expect.arrayContaining(updatedNoteData.tags));
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");
    expect(data.processingStatus).toBeTypeOf("string");
  });

  it("PATCH /api/notes/:id - should partially update the note entry", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const partialUpdate = {
      title: "Partially Updated Title",
    };

    const response = await loggedFetch(`${BASE_URL}/notes/${createdNoteId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(partialUpdate),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;

    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.title).toBe(partialUpdate.title);
    // Content should remain from the previous update
    expect(data.content).toBe(updatedNoteData.content);
    expect(data.description).toBeTypeOf("string");
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");
    expect(data.processingStatus).toBeTypeOf("string");
  });

  it("GET /api/notes with search parameters - should find notes by text", async () => {
    const response = await loggedFetch(`${BASE_URL}/notes?text=Partially`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    const responseData = (await response.json()) as any;
    const data = (responseData.entries || responseData) as NoteEntry[];

    expect(data).toBeInstanceOf(Array);

    const found = data.find((n) => n.id === createdNoteId);
    expect(found).toBeDefined();
    expect(found?.title).toContain("Partially");
  });

  it("GET /api/notes with tag filter - should find notes by tags", async () => {
    const response = await loggedFetch(`${BASE_URL}/notes?tags=updated`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(200);

    const responseData = (await response.json()) as any;
    const data = (responseData.entries || responseData) as NoteEntry[];

    expect(data).toBeInstanceOf(Array);

    const found = data.find((n) => n.id === createdNoteId);
    expect(found).toBeDefined();
    expect(found?.tags).toContain("updated");
  });

  it("PATCH /api/notes/:id/review - should update review status", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const reviewUpdate = {
      reviewStatus: "accepted" as const,
    };

    const response = await loggedFetch(
      `${BASE_URL}/notes/${createdNoteId}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(reviewUpdate),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.reviewStatus).toBe("accepted");
  });

  it("PATCH /api/notes/:id/flag - should update flag color", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const flagUpdate = {
      flagColor: "red" as const,
    };

    const response = await loggedFetch(
      `${BASE_URL}/notes/${createdNoteId}/flag`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(flagUpdate),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.flagColor).toBe("red");
  });

  it("PATCH /api/notes/:id/flag - should remove flag color with null", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const flagUpdate = {
      flagColor: null,
    };

    const response = await loggedFetch(
      `${BASE_URL}/notes/${createdNoteId}/flag`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(flagUpdate),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.flagColor).toBeNull();
  });

  it("PATCH /api/notes/:id/pin - should pin the note", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const pinUpdate = {
      isPinned: true,
    };

    const response = await loggedFetch(
      `${BASE_URL}/notes/${createdNoteId}/pin`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(pinUpdate),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.isPinned).toBe(true);
  });

  it("PATCH /api/notes/:id/pin - should unpin the note", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const pinUpdate = {
      isPinned: false,
    };

    const response = await loggedFetch(
      `${BASE_URL}/notes/${createdNoteId}/pin`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(pinUpdate),
      },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as NoteEntry;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdNoteId);
    expect(data.isPinned).toBe(false);
  });

  it("DELETE /api/notes/:id - should delete the note entry", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const response = await loggedFetch(`${BASE_URL}/notes/${createdNoteId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(204);
  });

  it("GET /api/notes/:id after deletion - should return 404", async () => {
    expect(
      createdNoteId,
      "Test setup failed: createdNoteId is null",
    ).not.toBeNull();

    const response = await loggedFetch(`${BASE_URL}/notes/${createdNoteId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
    });

    expect(response.status).toBe(404);
  });

  // --- Due Date and Enhanced Feature Tests ---

  describe("Due Date Functionality", () => {
    let dueDateNoteId: string | null = null;

    it("POST /api/notes - should create a note with due date", async () => {
      await delay(200);

      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      const noteData = {
        title: "Note with Due Date",
        content: "This note has a due date",
        tags: ["due-date", "test"],
        dueDate: dueDate.toISOString(),
      };

      const response = await loggedFetch(`${BASE_URL}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(noteData),
      });

      expect(response.status).toBe(201);

      const data = (await response.json()) as NoteEntry;
      expect(data).toBeDefined();
      expect(data.id).toBeTypeOf("string");
      expect(data.title).toBe(noteData.title);
      // Check that the due date is close enough (SQLite stores as seconds, so we lose millisecond precision)
      expect(data.dueDate).toBeDefined();
      expect(data.dueDate).not.toBeNull();
      const timeDiff = Math.abs(
        new Date(data.dueDate!).getTime() - dueDate.getTime(),
      );
      expect(timeDiff).toBeLessThan(1000); // Within 1 second

      dueDateNoteId = data.id;
    });

    it("PATCH /api/notes/:id - should update due date", async () => {
      expect(dueDateNoteId).not.toBeNull();

      const newDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days from now
      const updateData = {
        dueDate: newDueDate.toISOString(),
      };

      const response = await loggedFetch(`${BASE_URL}/notes/${dueDateNoteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as NoteEntry;
      expect(data.dueDate).toBeDefined();
      expect(data.dueDate).not.toBeNull();
      const timeDiff = Math.abs(
        new Date(data.dueDate!).getTime() - newDueDate.getTime(),
      );
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it("PATCH /api/notes/:id - should clear due date with null", async () => {
      expect(dueDateNoteId).not.toBeNull();

      const updateData = {
        dueDate: null,
      };

      const response = await loggedFetch(`${BASE_URL}/notes/${dueDateNoteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as NoteEntry;
      expect(data.dueDate).toBeNull();
    });

    it("GET /api/notes with due date search - should find notes by due date range", async () => {
      // First set a due date again for testing
      const testDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await loggedFetch(`${BASE_URL}/notes/${dueDateNoteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify({ dueDate: testDueDate.toISOString() }),
      });

      // Search for notes with due dates in the next 10 days
      const startDate = new Date().toISOString();
      const endDate = new Date(
        Date.now() + 10 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const response = await loggedFetch(
        `${BASE_URL}/notes?dueDateStart=${encodeURIComponent(startDate)}&dueDateEnd=${encodeURIComponent(endDate)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        },
      );

      expect(response.status).toBe(200);

      const responseData = (await response.json()) as any;
      const data = (responseData.entries || responseData) as NoteEntry[];

      expect(data).toBeInstanceOf(Array);
      const found = data.find((n) => n.id === dueDateNoteId);
      expect(found).toBeDefined();
      const timeDiff = Math.abs(
        new Date(found?.dueDate!).getTime() - testDueDate.getTime(),
      );
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    afterAll(async () => {
      // Clean up the due date test note
      if (dueDateNoteId) {
        await loggedFetch(`${BASE_URL}/notes/${dueDateNoteId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });
      }
    });
  });

  // --- Device Metadata and Enhanced Features Tests ---

  describe("Device Metadata and Enhanced Features", () => {
    let metadataNoteId: string | null = null;

    it("POST /api/notes - should create a note with device metadata", async () => {
      await delay(200);

      const noteData = {
        title: "Note with Device Metadata",
        content: "This note includes device information",
        tags: ["device-info", "test"],
        deviceName: "Test Device",
        deviceModel: "Test Model v1.0",
        metadata: {
          enabled: true,
          customField: "custom value",
        },
      };

      const response = await loggedFetch(`${BASE_URL}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify(noteData),
      });

      expect(response.status).toBe(201);

      const data = (await response.json()) as NoteEntry;
      expect(data).toBeDefined();
      expect(data.id).toBeTypeOf("string");
      expect(data.title).toBe(noteData.title);
      expect(data.content).toBe(noteData.content);
      expect(data.tags).toEqual(expect.arrayContaining(noteData.tags));

      // Note: Device metadata may not be directly returned in the response
      // as it's stored in the service layer, but the note should be created successfully
      metadataNoteId = data.id;
    });

    it("PATCH /api/notes/:id - should update note with device metadata", async () => {
      expect(metadataNoteId).not.toBeNull();

      const updateData = {
        title: "Updated Note with Device Metadata",
        deviceName: "Updated Device",
        deviceModel: "Updated Model v2.0",
        metadata: {
          enabled: false,
          newField: "new value",
        },
      };

      const response = await loggedFetch(
        `${BASE_URL}/notes/${metadataNoteId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify(updateData),
        },
      );

      expect(response.status).toBe(200);

      const data = (await response.json()) as NoteEntry;
      expect(data.title).toBe(updateData.title);
      expect(data.id).toBe(metadataNoteId);
    });

    afterAll(async () => {
      // Clean up the metadata test note
      if (metadataNoteId) {
        await loggedFetch(`${BASE_URL}/notes/${metadataNoteId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });
      }
    });
  });

  // --- Advanced Search and Pagination Tests ---

  describe("Advanced Search and Pagination", () => {
    const testNotes = [
      {
        title: "First Test Note",
        content: "Content for first note",
        tags: ["first", "test"],
      },
      {
        title: "Second Test Note",
        content: "Content for second note",
        tags: ["second", "test"],
      },
      {
        title: "Third Test Note",
        content: "Content for third note",
        tags: ["third", "test"],
      },
    ];
    const createdTestNoteIds: string[] = [];

    beforeAll(async () => {
      // Create test notes for pagination testing
      for (const noteData of testNotes) {
        await delay(100);
        const response = await loggedFetch(`${BASE_URL}/notes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify(noteData),
        });
        if (response.status === 201) {
          const data = (await response.json()) as NoteEntry;
          createdTestNoteIds.push(data.id);
        }
      }
    });

    it("GET /api/notes - should support pagination with limit and offset", async () => {
      const response = await loggedFetch(`${BASE_URL}/notes?limit=2&offset=0`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const responseData = (await response.json()) as any;
      expect(responseData.entries).toBeInstanceOf(Array);
      expect(responseData.pagination).toBeDefined();
      expect(responseData.pagination.limit).toBe(2);
      expect(responseData.pagination.offset).toBe(0);
      expect(responseData.pagination.total).toBeGreaterThan(0);
    });

    it("GET /api/notes - should support search by multiple tags", async () => {
      const response = await loggedFetch(`${BASE_URL}/notes?tags=test,first`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const responseData = (await response.json()) as any;
      const data = (responseData.entries || responseData) as NoteEntry[];

      expect(data).toBeInstanceOf(Array);
      // Should find notes that have both 'test' and 'first' tags
      const found = data.find(
        (n) => n.tags.includes("test") && n.tags.includes("first"),
      );
      expect(found).toBeDefined();
    });

    it("GET /api/notes - should support text search across title and content", async () => {
      const response = await loggedFetch(`${BASE_URL}/notes?text=First`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      expect(response.status).toBe(200);

      const responseData = (await response.json()) as any;
      const data = (responseData.entries || responseData) as NoteEntry[];

      expect(data).toBeInstanceOf(Array);
      const found = data.find(
        (n) => n.title.includes("First") || n.content.includes("first"),
      );
      expect(found).toBeDefined();
    });

    afterAll(async () => {
      // Clean up test notes
      for (const noteId of createdTestNoteIds) {
        await loggedFetch(`${BASE_URL}/notes/${noteId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });
      }
    });
  });

  // --- Error Handling Tests ---

  describe("Error Handling", () => {
    it("PATCH /api/notes/:id/review - should return 404 for non-existent note", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/notes/nonexistent-id/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({ reviewStatus: "accepted" }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("PATCH /api/notes/:id/flag - should return 404 for non-existent note", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/notes/nonexistent-id/flag`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({ flagColor: "red" }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("PATCH /api/notes/:id/pin - should return 404 for non-existent note", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/notes/nonexistent-id/pin`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({ isPinned: true }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("PATCH /api/notes/:id/review - should return 400 for invalid review status", async () => {
      // First create a note to test with
      const createResponse = await loggedFetch(`${BASE_URL}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify({
          title: "Test Note for Error Handling",
          content: "Test content",
          tags: ["error-test"],
        }),
      });

      expect(createResponse.status).toBe(201);
      const createdNote = (await createResponse.json()) as NoteEntry;

      // Try to update with invalid review status
      const response = await loggedFetch(
        `${BASE_URL}/notes/${createdNote.id}/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({ reviewStatus: "invalid-status" }),
        },
      );

      expect(response.status).toBe(400);

      // Clean up
      await loggedFetch(`${BASE_URL}/notes/${createdNote.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });
    });
  });
});
