import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  hasSameElements,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { Document, DocumentListResponse } from "../utils/types.js";

// Helper: create a document via FormData and return the parsed response
async function createTestDocument(
  authenticatedFetch: ReturnType<typeof createAuthenticatedFetch>,
  overrides: {
    title?: string;
    description?: string;
    tags?: string[];
    dueDate?: string | null;
    filename?: string;
    content?: string;
    mimeType?: string;
  } = {},
): Promise<Document> {
  const title = overrides.title ?? "Test Document";
  const description = overrides.description ?? "Test document description";
  const tags = overrides.tags ?? ["test"];
  const filename = overrides.filename ?? "test-document.txt";
  const content =
    overrides.content ?? "Dummy file content for integration test.";
  const mimeType = overrides.mimeType ?? "text/plain";

  const formData = new FormData();
  const metadata: Record<string, unknown> = {
    title,
    description,
    tags,
    originalFilename: filename,
  };
  if (overrides.dueDate !== undefined) {
    metadata.dueDate = overrides.dueDate;
  }
  formData.append("metadata", JSON.stringify(metadata));

  const fileBuffer = Buffer.from(content);
  const fileBlob = new Blob([fileBuffer], { type: mimeType });
  formData.append("content", fileBlob, filename);

  const response = await authenticatedFetch(`${BASE_URL}/documents`, {
    method: "POST",
    body: formData,
  });

  expect(response.status).toBe(201);
  return (await response.json()) as Document;
}

// Helper: delete a document (best-effort cleanup)
async function deleteTestDocument(
  authenticatedFetch: ReturnType<typeof createAuthenticatedFetch>,
  id: string,
): Promise<void> {
  await authenticatedFetch(`${BASE_URL}/documents/${id}`, {
    method: "DELETE",
  });
}

describe("Documents API Integration Tests", () => {
  let createdDocumentId: string | null = null;
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);

  const initialDocumentData = {
    title: "Test Document Entry via Form Data",
    description: "Initial content for the test document uploaded via form.",
    tags: ["test", "integration"],
    filename: "test-document.txt",
    content: "This is the dummy file content for the integration test.",
    mimeType: "text/plain",
  };

  const updatedDocumentData = {
    title: "Updated Test Document Metadata",
    description: "This is the updated document description.",
    tags: ["updated", "test"],
    reviewStatus: "pending" as const,
    isPinned: false,
  };

  // --- CRUD Sequence ---

  it("POST /api/documents - should create a new document entry using FormData", async () => {
    await delay(100);

    const data = await createTestDocument(
      authenticatedFetch,
      initialDocumentData,
    );

    // Save ID first
    createdDocumentId = data.id;
    expect(createdDocumentId).not.toBeNull();

    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    expect(data.id).toMatch(/^doc-/);
    expect(data.title).toBe(initialDocumentData.title);
    expect(data.description).toBe(initialDocumentData.description);
    expect(data.originalFilename).toBe(initialDocumentData.filename);
    expect(data.mimeType).toBe(initialDocumentData.mimeType);
    expect(data.fileSize).toBe(Buffer.from(initialDocumentData.content).length);
    expect(data.fileUrl).toMatch(
      new RegExp(`^/api/documents/${data.id}/file$`),
    );
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");
    expect(Array.isArray(data.tags)).toBe(true);
    expect(hasSameElements(data.tags, initialDocumentData.tags)).toBe(true);

    // Verify defaults
    expect(data.reviewStatus).toBe("pending");
    expect(data.flagColor).toBeNull();
    expect(data.isPinned).toBe(false);
    expect(data.dueDate).toBeNull();

    // Processing status may be null or a valid status
    if (data.processingStatus !== null) {
      expect(["pending", "processing"]).toContain(data.processingStatus);
    }
  }, 15000);

  it("GET /api/documents/:id - should retrieve the created document entry", async () => {
    expect(
      createdDocumentId,
      "Test setup failed: createdDocumentId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/documents/${createdDocumentId}`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Document;

    expect(data.id).toBe(createdDocumentId);
    expect(data.title).toBe(initialDocumentData.title);
    expect(data.description).toBe(initialDocumentData.description);
    expect(data.originalFilename).toBe(initialDocumentData.filename);
    expect(data.mimeType).toBe(initialDocumentData.mimeType);
    expect(hasSameElements(data.tags, initialDocumentData.tags)).toBe(true);
    expect(data.reviewStatus).toBe("pending");
    expect(data.flagColor).toBeNull();
    expect(data.isPinned).toBe(false);
    expect(data.dueDate).toBeNull();
  });

  it("GET /api/documents - should list document entries including the new one", async () => {
    expect(
      createdDocumentId,
      "Test setup failed: createdDocumentId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(`${BASE_URL}/documents`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    // Verify paginated response shape
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.totalCount).toBeTypeOf("number");
    expect(data.totalCount).toBeGreaterThan(0);
    expect(data.limit).toBeTypeOf("number");
    expect(data.offset).toBeTypeOf("number");

    const found = data.items.find((doc) => doc.id === createdDocumentId);
    expect(
      found,
      `Document with ID ${createdDocumentId} not found in the list`,
    ).toBeDefined();
    expect(found?.title).toBe(initialDocumentData.title);
  });

  it("PUT /api/documents/:id - should update the document entry metadata", async () => {
    expect(
      createdDocumentId,
      "Test setup failed: createdDocumentId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/documents/${createdDocumentId}`,
      {
        method: "PUT",
        body: JSON.stringify(updatedDocumentData),
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Document;

    expect(data.id).toBe(createdDocumentId);
    expect(data.title).toBe(updatedDocumentData.title);
    expect(data.description).toBe(updatedDocumentData.description);
    // File details should remain unchanged
    expect(data.originalFilename).toBe(initialDocumentData.filename);
    expect(data.mimeType).toBe(initialDocumentData.mimeType);
    expect(hasSameElements(data.tags, updatedDocumentData.tags)).toBe(true);
    expect(data.reviewStatus).toBe(updatedDocumentData.reviewStatus);
    expect(data.isPinned).toBe(updatedDocumentData.isPinned);
  });

  it("GET /api/documents/:id - should retrieve the updated document entry", async () => {
    expect(
      createdDocumentId,
      "Test setup failed: createdDocumentId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/documents/${createdDocumentId}`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Document;

    expect(data.id).toBe(createdDocumentId);
    expect(data.title).toBe(updatedDocumentData.title);
    expect(data.description).toBe(updatedDocumentData.description);
    expect(hasSameElements(data.tags, updatedDocumentData.tags)).toBe(true);
    expect(data.reviewStatus).toBe(updatedDocumentData.reviewStatus);
    expect(data.isPinned).toBe(updatedDocumentData.isPinned);
  });

  it("DELETE /api/documents/:id - should delete the document entry", async () => {
    expect(
      createdDocumentId,
      "Test setup failed: createdDocumentId is null",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/documents/${createdDocumentId}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(204);
  });

  it("GET /api/documents/:id - should return 404 for the deleted document entry", async () => {
    expect(
      createdDocumentId,
      "Test cleanup check requires createdDocumentId",
    ).not.toBeNull();

    const response = await authenticatedFetch(
      `${BASE_URL}/documents/${createdDocumentId}`,
      { method: "GET" },
    );

    expect(response.status).toBe(404);
  });

  it("GET /api/documents - should not list the deleted document", async () => {
    expect(
      createdDocumentId,
      "Test cleanup check requires createdDocumentId",
    ).not.toBeNull();

    const response = await authenticatedFetch(`${BASE_URL}/documents`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentListResponse;

    expect(data.items).toBeInstanceOf(Array);
    const found = data.items.find((doc) => doc.id === createdDocumentId);
    expect(
      found,
      `Deleted document with ID ${createdDocumentId} should not be in the list`,
    ).toBeUndefined();
  });

  // --- Feature Tests (create-in-test + try/finally cleanup) ---

  it("PATCH /api/documents/:id/review - should update review status", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Review Test Document",
      tags: ["review-test"],
    });

    try {
      const response = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ reviewStatus: "accepted" }),
        },
      );

      expect(response.status).toBe(200);
      const updated = (await response.json()) as Document;
      expect(updated.reviewStatus).toBe("accepted");
      expect(updated.id).toBe(doc.id);
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  it("PATCH /api/documents/:id/flag - should update flag color", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Flag Test Document",
      tags: ["flag-test"],
    });

    try {
      // Set flag
      const flagResponse = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/flag`,
        {
          method: "PATCH",
          body: JSON.stringify({ flagColor: "red" }),
        },
      );

      expect(flagResponse.status).toBe(200);
      const flagged = (await flagResponse.json()) as Document;
      expect(flagged.flagColor).toBe("red");
      expect(flagged.id).toBe(doc.id);

      // Remove flag
      const unflagResponse = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/flag`,
        {
          method: "PATCH",
          body: JSON.stringify({ flagColor: null }),
        },
      );

      expect(unflagResponse.status).toBe(200);
      const unflagged = (await unflagResponse.json()) as Document;
      expect(unflagged.flagColor).toBeNull();
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  it("PATCH /api/documents/:id/pin - should update pin status", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Pin Test Document",
      tags: ["pin-test"],
    });

    try {
      // Pin
      const pinResponse = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify({ isPinned: true }),
        },
      );

      expect(pinResponse.status).toBe(200);
      const pinned = (await pinResponse.json()) as Document;
      expect(pinned.isPinned).toBe(true);
      expect(pinned.id).toBe(doc.id);

      // Unpin
      const unpinResponse = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify({ isPinned: false }),
        },
      );

      expect(unpinResponse.status).toBe(200);
      const unpinned = (await unpinResponse.json()) as Document;
      expect(unpinned.isPinned).toBe(false);
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  it("PATCH /api/documents/:id - should support partial updates with new fields", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Partial Update Test",
      description: "Original description",
      tags: ["partial", "test"],
    });

    try {
      const partialUpdate = {
        description: "Updated description via PATCH",
        reviewStatus: "accepted" as const,
        flagColor: "blue" as const,
        isPinned: true,
        dueDate: "2026-06-15T09:00:00.000Z",
      };

      const response = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(partialUpdate),
        },
      );

      expect(response.status).toBe(200);
      const updated = (await response.json()) as Document;

      // Verify updated fields
      expect(updated.description).toBe(partialUpdate.description);
      expect(updated.reviewStatus).toBe(partialUpdate.reviewStatus);
      expect(updated.flagColor).toBe(partialUpdate.flagColor);
      expect(updated.isPinned).toBe(partialUpdate.isPinned);
      expect(updated.dueDate).not.toBeNull();

      // Verify unchanged fields
      expect(updated.title).toBe("Partial Update Test");
      expect(updated.originalFilename).toBe("test-document.txt");
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  it("PATCH /api/documents/:id - should update and clear due date", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Due Date Test",
      tags: ["due-date-test"],
    });

    try {
      // Set due date
      const newDueDate = new Date(
        Date.now() + 21 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const setResponse = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ dueDate: newDueDate }),
        },
      );

      expect(setResponse.status).toBe(200);
      const withDueDate = (await setResponse.json()) as Document;
      expect(withDueDate.dueDate).not.toBeNull();

      // Clear due date
      const clearResponse = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ dueDate: null }),
        },
      );

      expect(clearResponse.status).toBe(200);
      const cleared = (await clearResponse.json()) as Document;
      expect(cleared.dueDate).toBeNull();
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  // --- Reprocess Endpoint ---

  it("POST /api/documents/:id/reprocess - should queue document for reprocessing", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Reprocess Test",
      tags: ["reprocess-test"],
    });

    try {
      const response = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/reprocess`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      // Should be 202 Accepted or 400 if already processing
      expect([202, 400]).toContain(response.status);

      if (response.status === 202) {
        const data = (await response.json()) as {
          message: string;
          documentId: string;
        };
        expect(data.documentId).toBe(doc.id);
      }
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  // --- Asset Endpoint 404 Tests ---

  it("GET /api/documents/:id/file - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/file`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/documents/:id/thumbnail - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/thumbnail`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/documents/:id/screenshot - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/screenshot`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/documents/:id/pdf - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/pdf`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/documents/:id/content - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/content`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/documents/:id/extracted-md - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/extracted-md`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/documents/:id/extracted-txt - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/extracted-txt`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  // --- Error Handling Tests ---

  it("GET /api/documents/:id - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345`,
      { method: "GET" },
    );
    expect(response.status).toBe(404);
  });

  it("PUT /api/documents/:id - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345`,
      {
        method: "PUT",
        body: JSON.stringify({
          title: "Test",
          tags: [],
        }),
      },
    );
    expect([404, 500]).toContain(response.status);
  });

  it("PATCH /api/documents/:id - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Test" }),
      },
    );
    expect([404, 500]).toContain(response.status);
  });

  it("DELETE /api/documents/:id - should handle non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345`,
      { method: "DELETE" },
    );
    // deleteDocument returns { success: true } even if not found, route returns 204
    expect([204, 404]).toContain(response.status);
  });

  it("PATCH /api/documents/:id/review - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/review`,
      {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "accepted" }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("PATCH /api/documents/:id/flag - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/flag`,
      {
        method: "PATCH",
        body: JSON.stringify({ flagColor: "red" }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("PATCH /api/documents/:id/pin - should return 404 for non-existent document", async () => {
    const response = await authenticatedFetch(
      `${BASE_URL}/documents/doc-nonexistent12345/pin`,
      {
        method: "PATCH",
        body: JSON.stringify({ isPinned: true }),
      },
    );
    expect(response.status).toBe(404);
  });

  // --- Validation Error Tests ---

  it("PATCH /api/documents/:id/review - should return 400 for invalid review status", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Validation Test",
      tags: ["validation-test"],
    });

    try {
      const response = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({ reviewStatus: "invalid-status" }),
        },
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect((error as any).error).toBeDefined();
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });

  it("PATCH /api/documents/:id/flag - should return 400 for invalid flag color", async () => {
    const doc = await createTestDocument(authenticatedFetch, {
      title: "Flag Validation Test",
      tags: ["validation-test"],
    });

    try {
      const response = await authenticatedFetch(
        `${BASE_URL}/documents/${doc.id}/flag`,
        {
          method: "PATCH",
          body: JSON.stringify({ flagColor: "invalid-color" }),
        },
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect((error as any).error).toBeDefined();
    } finally {
      await deleteTestDocument(authenticatedFetch, doc.id);
    }
  });
});
