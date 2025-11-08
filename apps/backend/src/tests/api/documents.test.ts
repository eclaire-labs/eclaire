import { Buffer } from "buffer"; // Import Buffer for creating file content
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import { Document } from "../utils/types.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

// Custom interface for Documents API response (matches DocumentResponseSchema)
interface DocumentResponse {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  createdAt: string; // ISO 8601 String
  updatedAt: string; // ISO 8601 String
  dueDate: string | null;

  // File metadata
  originalFilename: string | null;
  mimeType: string;
  fileSize: number | null;

  // Processing status
  processingStatus: "pending" | "processing" | "completed" | "failed" | null;

  // Review and organization
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;

  // Asset URLs
  thumbnailUrl: string | null;
  pdfUrl: string | null;
  contentUrl: string | null;
  fileUrl: string | null;

  // Optional content metadata
  extractedText: string | null;
  pageCount: number | null;
  hasExtractedText?: boolean;
  hasOcr?: boolean;
}

// Helper to check if a string is a valid ISO 8601 datetime string
const isValidISO8601 = (dateString: string | null | undefined): boolean => {
  if (!dateString) return false; // Expect dates for createdAt/updatedAt
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  return iso8601Regex.test(dateString);
};

describe("Documents API Integration Tests", () => {
  let createdDocumentId: string | null = null;

  // Helper function to ensure we have a created document
  const ensureDocumentCreated = async (): Promise<string> => {
    if (createdDocumentId) {
      return createdDocumentId;
    }
    throw new Error(
      "Document was not created in the POST test. Check the POST test for failures.",
    );
  };

  // --- Adjusted Test Data for POST (matches new API requirements) ---
  const documentTitle = "Test Document Entry via Form Data";
  const documentDescription =
    "Initial content for the test document uploaded via form.";
  const documentTags = "test,integration"; // Comma-separated for the form field
  const documentFilename = "test-document.txt";
  const documentContent =
    "This is the dummy file content for the integration test.";
  const documentMimeType = "text/plain"; // Matches allowed types in route

  // --- Test Data for PUT (assuming it still uses JSON and updates metadata) ---
  const updatedDocumentData = {
    title: "Updated Test Document Metadata",
    description: "This is the updated document description.",
    tags: ["updated", "test"], // Send as array for JSON PUT
    reviewStatus: "pending" as const,
    // flagColor is optional, so we omit it instead of setting to null
    isPinned: false,
    // dueDate is optional, so we omit it instead of setting to null
  };

  // --- Test Sequence ---

  it("POST /api/documents - should create a new document entry using FormData", async () => {
    await delay(100); // Small delay

    // --- Create FormData ---
    const formData = new FormData();

    // Prepare metadata object to match backend API expectations
    const metadata = {
      title: documentTitle,
      description: documentDescription,
      tags: documentTags.split(",").map((tag) => tag.trim()), // Convert to array
      originalFilename: documentFilename,
    };

    // Append metadata as JSON string (backend expects this format)
    formData.append("metadata", JSON.stringify(metadata));

    // Create dummy file content as a Blob
    const fileBuffer = Buffer.from(documentContent);
    const fileBlob = new Blob([fileBuffer], { type: documentMimeType });

    // Append the file as 'content' (not 'documentFile') to match backend API
    formData.append("content", fileBlob, documentFilename);

    // --- Make the Request ---
    const response = await loggedFetch(`${BASE_URL}/documents`, {
      method: "POST",
      // IMPORTANT: DO NOT set 'Content-Type': 'multipart/form-data' manually.
      // 'fetch' will set the correct Content-Type with boundary when body is FormData.
      // The loggedFetch helper will handle Authorization and avoid setting Content-Type for FormData
      body: formData, // Pass the FormData object directly
    });

    // --- Assertions ---
    expect(response.status).toBe(201); // Expect 'Created'

    const data = (await response.json()) as DocumentResponse; // Use the updated interface

    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    expect(data.id).toMatch(/^doc-/);
    expect(data.title).toBe(documentTitle);
    expect(data.description).toBe(documentDescription);
    expect(data.originalFilename).toBe(documentFilename);
    expect(data.mimeType).toBe(documentMimeType);
    expect(data.fileSize).toBe(fileBuffer.length);
    // Corrected line
    expect(data.fileUrl).toMatch(
      new RegExp(`^/api/documents/${data.id}/file$`),
    );
    expect(
      isValidISO8601(data.createdAt),
      `Invalid createdAt format: ${data.createdAt}`,
    ).toBe(true);
    expect(
      isValidISO8601(data.updatedAt),
      `Invalid updatedAt format: ${data.updatedAt}`,
    ).toBe(true);
    expect(Array.isArray(data.tags)).toBe(true);
    // Check if the tags sent (split) are included in the response tags
    expect(data.tags).toEqual(
      expect.arrayContaining(documentTags.split(",").map((tag) => tag.trim())),
    );

    // Check new schema fields
    expect(data.reviewStatus).toBe("pending"); // Default value
    expect(data.flagColor).toBeNull(); // Default value
    expect(data.isPinned).toBe(false); // Default value
    expect(data.dueDate).toBeNull(); // Not set in this test
    // processingStatus may be null initially or a valid status string
    if (data.processingStatus !== null) {
      expect(typeof data.processingStatus).toBe("string");
      expect(data.processingStatus).toMatch(/^(pending|processing)$/);
    }
    // Asset URLs may be null initially, will be populated after processing
    expect(
      typeof data.thumbnailUrl === "string" || data.thumbnailUrl === null,
    ).toBe(true);
    expect(typeof data.pdfUrl === "string" || data.pdfUrl === null).toBe(true);
    expect(
      typeof data.contentUrl === "string" || data.contentUrl === null,
    ).toBe(true);

    createdDocumentId = data.id; // Store the ID for subsequent tests
    expect(createdDocumentId).not.toBeNull();

    console.log(
      `✅ Document created successfully with ID: ${createdDocumentId}`,
    );
  }, 15000); // Increase timeout slightly for potential file handling

  // --- Other Tests (GET, PUT, DELETE) - Update assertions based on DocumentResponse ---

  it("GET /api/documents/:id - should retrieve the created document entry", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const response = await loggedFetch(`${BASE_URL}/documents/${documentId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentResponse;

    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.title).toBe(documentTitle); // Should match the initially created title
    expect(data.description).toBe(documentDescription); // Should match the initially created description
    expect(data.originalFilename).toBe(documentFilename);
    expect(data.mimeType).toBe(documentMimeType);
    expect(isValidISO8601(data.createdAt)).toBe(true);
    expect(isValidISO8601(data.updatedAt)).toBe(true);
    expect(data.tags).toEqual(
      expect.arrayContaining(documentTags.split(",").map((tag) => tag.trim())),
    );

    // Check schema fields
    expect(data.reviewStatus).toBe("pending");
    expect(data.flagColor).toBeNull();
    expect(data.isPinned).toBe(false);
    expect(data.dueDate).toBeNull();
  }, 10000);

  it("GET /api/documents - should list document entries including the new one", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    // Assuming the GET /api/documents returns an object { documents: [], totalCount: ... }
    // Adjust if your API returns a flat array directly
    const response = await loggedFetch(`${BASE_URL}/documents`, {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(response.status).toBe(200);

    // Backend returns an object with documents array and metadata
    const response_data = (await response.json()) as {
      documents: DocumentResponse[];
      totalCount: number;
      limit: number;
    };
    expect(response_data).toBeDefined();
    expect(response_data.documents).toBeInstanceOf(Array); // Verify documents is an array
    expect(response_data.totalCount).toBeGreaterThan(0);
    expect(response_data.limit).toBeGreaterThan(0);

    // Work with the documents array
    const documentsList = response_data.documents;
    expect(documentsList.length).toBeGreaterThan(0);
    const found = documentsList.find((doc) => doc.id === documentId);

    expect(
      found,
      `Document with ID ${documentId} not found in the list`,
    ).toBeDefined();
    expect(found?.title).toBe(documentTitle); // Check title of found item
    expect(isValidISO8601(found!.createdAt)).toBe(true);
    expect(isValidISO8601(found!.updatedAt)).toBe(true);
    expect(Array.isArray(found!.tags)).toBe(true);
  }, 10000);

  it("PUT /api/documents/:id - should update the document entry metadata", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    // Assuming PUT still accepts JSON for metadata updates (check your PUT route if unsure)
    const response = await loggedFetch(`${BASE_URL}/documents/${documentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json", // Keep JSON for PUT if applicable
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(updatedDocumentData), // Send updated title, description, tags
    });

    expect(response.status).toBe(200); // Expect OK for update

    const data = (await response.json()) as DocumentResponse;

    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.title).toBe(updatedDocumentData.title); // Check updated title
    expect(data.description).toBe(updatedDocumentData.description); // Check updated description
    // File details should remain unchanged by this PUT
    expect(data.originalFilename).toBe(documentFilename);
    expect(data.mimeType).toBe(documentMimeType);
    expect(data.tags).toEqual(expect.arrayContaining(updatedDocumentData.tags)); // Check updated tags
    expect(isValidISO8601(data.createdAt)).toBe(true); // createdAt should not change
    expect(isValidISO8601(data.updatedAt)).toBe(true); // updatedAt should change (or at least be valid)

    // Check that other fields remain as expected
    expect(data.reviewStatus).toBe(updatedDocumentData.reviewStatus);
    expect(data.isPinned).toBe(updatedDocumentData.isPinned);
    // flagColor and dueDate should remain as they were (likely null) since we didn't update them
  }, 10000);

  it("GET /api/documents/:id - should retrieve the updated document entry", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const response = await loggedFetch(`${BASE_URL}/documents/${documentId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as DocumentResponse;

    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.title).toBe(updatedDocumentData.title); // Verify updated title
    expect(data.description).toBe(updatedDocumentData.description); // Verify updated description
    expect(data.originalFilename).toBe(documentFilename);
    expect(data.mimeType).toBe(documentMimeType);
    expect(data.tags).toEqual(expect.arrayContaining(updatedDocumentData.tags)); // Verify updated tags
    expect(isValidISO8601(data.createdAt)).toBe(true);
    expect(isValidISO8601(data.updatedAt)).toBe(true);

    // Verify updated fields
    expect(data.reviewStatus).toBe(updatedDocumentData.reviewStatus);
    expect(data.isPinned).toBe(updatedDocumentData.isPinned);
    // flagColor and dueDate should remain as they were since we didn't update them
  }, 10000);

  // --- PATCH endpoint tests ---

  it("PATCH /api/documents/:id/review - should update review status", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const reviewUpdate = {
      reviewStatus: "accepted" as const,
    };

    const response = await loggedFetch(
      `${BASE_URL}/documents/${documentId}/review`,
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

    const data = (await response.json()) as DocumentResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.reviewStatus).toBe("accepted");
  }, 10000);

  it("PATCH /api/documents/:id/flag - should update flag color", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const flagUpdate = {
      flagColor: "red" as const,
    };

    const response = await loggedFetch(
      `${BASE_URL}/documents/${documentId}/flag`,
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

    const data = (await response.json()) as DocumentResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.flagColor).toBe("red");
  }, 10000);

  it("PATCH /api/documents/:id/flag - should remove flag color with null", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const flagUpdate = {
      flagColor: null,
    };

    const response = await loggedFetch(
      `${BASE_URL}/documents/${documentId}/flag`,
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

    const data = (await response.json()) as DocumentResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.flagColor).toBeNull();
  }, 10000);

  it("PATCH /api/documents/:id/pin - should pin the document", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const pinUpdate = {
      isPinned: true,
    };

    const response = await loggedFetch(
      `${BASE_URL}/documents/${documentId}/pin`,
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

    const data = (await response.json()) as DocumentResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.isPinned).toBe(true);
  }, 10000);

  it("PATCH /api/documents/:id/pin - should unpin the document", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const pinUpdate = {
      isPinned: false,
    };

    const response = await loggedFetch(
      `${BASE_URL}/documents/${documentId}/pin`,
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

    const data = (await response.json()) as DocumentResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.isPinned).toBe(false);
  }, 10000);

  it("PATCH /api/documents/:id - should partially update document metadata", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const partialUpdate = {
      title: "Partially Updated Document Title",
      flagColor: "blue" as const,
    };

    const response = await loggedFetch(`${BASE_URL}/documents/${documentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(partialUpdate),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as DocumentResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(documentId);
    expect(data.title).toBe(partialUpdate.title);
    expect(data.flagColor).toBe(partialUpdate.flagColor);
    // Other fields should remain unchanged
    expect(data.originalFilename).toBe(documentFilename);
    expect(data.mimeType).toBe(documentMimeType);
  }, 10000);

  it("DELETE /api/documents/:id - should delete the document entry", async () => {
    const documentId = await ensureDocumentCreated();
    await delay(100);

    const response = await loggedFetch(`${BASE_URL}/documents/${documentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    // Your service returns { success: true } with 200 OK based on the provided code
    // Adjust if your DELETE route sends 204 No Content
    // expect(response.status).toBe(204); // Previous expectation
    expect(response.status).toBe(204); // Based on service code returning JSON { success: true }

    // If expecting { success: true } body:
    //const data = await response.json();
    //expect(data).toEqual({ success: true });
  }, 10000);

  it("GET /api/documents/:id - should return 404 for the deleted document entry", async () => {
    // Note: Test name updated to expect 404 specifically, as the service throws NotFoundError
    expect(
      createdDocumentId,
      "Test cleanup check requires createdDocumentId",
    ).not.toBeNull();
    await delay(100);

    const response = await loggedFetch(
      `${BASE_URL}/documents/${createdDocumentId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      },
    );

    // Expect 404 Not Found specifically, based on how getDocumentById throws
    expect(response.status).toBe(404);
  }, 10000);

  // --- Advanced Search and Due Date Tests ---

  describe("Advanced Search and Due Date Functionality", () => {
    const searchTestDocumentIds: string[] = [];

    beforeAll(async () => {
      // Create test documents for search testing
      const testDocuments = [
        {
          title: "First Search Test Document",
          description: "PDF document for search testing",
          tags: ["search", "test", "first"],
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        },
        {
          title: "Second Search Test Document",
          description: "Word document for search testing",
          tags: ["search", "test", "second"],
          dueDate: new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 14 days from now
        },
        {
          title: "Third Search Test Document",
          description: "Excel document for search testing",
          tags: ["search", "test", "third"],
          dueDate: null,
        },
      ];

      for (const docData of testDocuments) {
        await delay(100);

        const formData = new FormData();
        const metadata = {
          title: docData.title,
          description: docData.description,
          tags: docData.tags,
          dueDate: docData.dueDate,
        };

        formData.append("metadata", JSON.stringify(metadata));

        const fileBuffer = Buffer.from(`Test content for ${docData.title}`);
        const fileBlob = new Blob([fileBuffer], { type: "text/plain" });
        formData.append(
          "content",
          fileBlob,
          `${docData.title.toLowerCase().replace(/\s+/g, "-")}.txt`,
        );

        const response = await loggedFetch(`${BASE_URL}/documents`, {
          method: "POST",
          body: formData,
        });

        if (response.status === 201) {
          const data = (await response.json()) as DocumentResponse;
          searchTestDocumentIds.push(data.id);
        }
      }
    });

    it("GET /api/documents with text search - should find documents by text", async () => {
      const response = await loggedFetch(`${BASE_URL}/documents?text=First`, {
        method: "GET",
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        documents: DocumentResponse[];
        totalCount: number;
        limit: number;
      };

      expect(data.documents).toBeInstanceOf(Array);
      const found = data.documents.find((doc) => doc.title.includes("First"));
      expect(found).toBeDefined();
    }, 10000);

    it("GET /api/documents with tag search - should find documents by tags", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/documents?tags=search,first`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        documents: DocumentResponse[];
        totalCount: number;
        limit: number;
      };

      expect(data.documents).toBeInstanceOf(Array);
      const found = data.documents.find(
        (doc) => doc.tags.includes("search") && doc.tags.includes("first"),
      );
      expect(found).toBeDefined();
    }, 10000);

    it("GET /api/documents with sorting - should sort documents by title", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/documents?tags=search&sortBy=title&sortDir=asc`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        documents: DocumentResponse[];
        totalCount: number;
        limit: number;
      };

      expect(data.documents).toBeInstanceOf(Array);
      if (data.documents.length > 1) {
        // Check if the documents we created are in the expected order
        // Filter to only our test documents to avoid interference from other tests
        const ourTestDocs = data.documents.filter((doc) =>
          doc.title.includes("Search Test Document"),
        );

        if (ourTestDocs.length > 1) {
          const titles = ourTestDocs.map((doc) => doc.title);
          // Just verify that first comes before second alphabetically
          const hasFirstBeforeSecond = titles.some(
            (title, index) =>
              title.includes("First") &&
              titles
                .slice(index + 1)
                .some((laterTitle) => laterTitle.includes("Second")),
          );
          expect(hasFirstBeforeSecond).toBe(true);
        }
      }
    }, 10000);

    it("GET /api/documents with due date range - should find documents by due date", async () => {
      const startDate = new Date().toISOString().split("T")[0]; // Today
      const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]; // 10 days from now

      const response = await loggedFetch(
        `${BASE_URL}/documents?dueDateStart=${startDate}&dueDateEnd=${endDate}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        documents: DocumentResponse[];
        totalCount: number;
        limit: number;
      };

      expect(data.documents).toBeInstanceOf(Array);
      // Should find the document with due date in 7 days
      const found = data.documents.find(
        (doc) =>
          doc.dueDate &&
          new Date(doc.dueDate) <=
            new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      );
      expect(found).toBeDefined();
    }, 10000);

    it("GET /api/documents with pagination - should support limit and offset", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/documents?tags=search&limit=2&offset=0`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        documents: DocumentResponse[];
        totalCount: number;
        limit: number;
      };

      expect(data.documents).toBeInstanceOf(Array);
      expect(data.documents.length).toBeLessThanOrEqual(2);
      expect(data.totalCount).toBeGreaterThan(0);
      expect(data.limit).toBe(2);
    }, 10000);

    it("PATCH /api/documents/:id - should update due date", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];
      const newDueDate = new Date(
        Date.now() + 21 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 21 days from now

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({ dueDate: newDueDate }),
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as DocumentResponse;

      expect(data.dueDate).toBeDefined();
      expect(data.dueDate).not.toBeNull();
      const timeDiff = Math.abs(
        new Date(data.dueDate!).getTime() - new Date(newDueDate).getTime(),
      );
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    }, 10000);

    it("PATCH /api/documents/:id - should clear due date with null", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({ dueDate: null }),
        },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as DocumentResponse;

      expect(data.dueDate).toBeNull();
    }, 10000);

    // --- File Asset Tests ---

    it("GET /api/documents/:id/file - should download document file", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}/file`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      // Should either succeed (200) or return 404 if file not found
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        // Check that we got file content
        const contentType = response.headers.get("content-type");
        expect(contentType).toBeDefined();

        // Should be able to read as text since we uploaded text files
        const content = await response.text();
        expect(content).toContain("Test content");
      }
    }, 10000);

    it("GET /api/documents/:id/thumbnail - should return thumbnail or 404", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}/thumbnail`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      // Thumbnail may not be generated for text files, so 404 is acceptable
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        const contentType = response.headers.get("content-type");
        expect(contentType).toMatch(/^image\//); // Should be an image
      }
    }, 10000);

    it("GET /api/documents/:id/pdf - should return PDF or 404", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}/pdf`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      // PDF may not be generated yet, so 404 is acceptable
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        const contentType = response.headers.get("content-type");
        expect(contentType).toBe("application/pdf");
      }
    }, 10000);

    it("GET /api/documents/:id/content - should return extracted content or 404", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}/content`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      // Content may not be extracted yet, so 404 is acceptable
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        const contentType = response.headers.get("content-type");
        expect(contentType).toMatch(/^text\//); // Should be text content
      }
    }, 10000);

    it("GET /api/documents/:id/extracted-md - should return extracted markdown or 404", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}/extracted-md`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      // Markdown may not be extracted yet, so 404 is acceptable
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        const contentType = response.headers.get("content-type");
        expect(contentType).toBe("text/markdown");
      }
    }, 10000);

    it("GET /api/documents/:id/extracted-txt - should return extracted text or 404", async () => {
      if (searchTestDocumentIds.length === 0) {
        throw new Error("No search test documents created");
      }

      const documentId = searchTestDocumentIds[0];

      const response = await loggedFetch(
        `${BASE_URL}/documents/${documentId}/extracted-txt`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      // Text may not be extracted yet, so 404 is acceptable
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        const contentType = response.headers.get("content-type");
        expect(contentType).toBe("text/plain");
      }
    }, 10000);

    it("GET /api/documents/:id/file - should return 404 for non-existent document", async () => {
      const response = await loggedFetch(
        `${BASE_URL}/documents/nonexistent-id/file`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        },
      );

      expect(response.status).toBe(404);
    }, 10000);

    afterAll(async () => {
      // Clean up search test documents
      for (const docId of searchTestDocumentIds) {
        await loggedFetch(`${BASE_URL}/documents/${docId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        });
      }
    });
  });
});

// --- Error Handling Tests ---

describe("Documents API Error Handling", () => {
  it("PATCH /api/documents/:id/review - should return 404 for non-existent document", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/documents/nonexistent-id/review`,
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
  }, 10000);

  it("PATCH /api/documents/:id/flag - should return 404 for non-existent document", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/documents/nonexistent-id/flag`,
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
  }, 10000);

  it("PATCH /api/documents/:id/pin - should return 404 for non-existent document", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/documents/nonexistent-id/pin`,
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
  }, 10000);

  it("PATCH /api/documents/:id/review - should return 400 for invalid review status", async () => {
    // First create a document to test with
    const formData = new FormData();
    const metadata = {
      title: "Test Document for Error Handling",
      description: "Test document",
      tags: ["error-test"],
    };

    formData.append("metadata", JSON.stringify(metadata));

    const fileBuffer = Buffer.from("Test content for error handling");
    const fileBlob = new Blob([fileBuffer], { type: "text/plain" });
    formData.append("content", fileBlob, "error-test.txt");

    const createResponse = await loggedFetch(`${BASE_URL}/documents`, {
      method: "POST",
      body: formData,
    });

    expect(createResponse.status).toBe(201);
    const createdDoc = (await createResponse.json()) as DocumentResponse;

    // Try to update with invalid review status
    const response = await loggedFetch(
      `${BASE_URL}/documents/${createdDoc.id}/review`,
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
    await loggedFetch(`${BASE_URL}/documents/${createdDoc.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
  }, 10000);
});
