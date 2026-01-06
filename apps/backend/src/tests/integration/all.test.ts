import { readFile } from "fs/promises";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

// API response interfaces (these differ from shared database types)
interface ApiResponse {
  id: string;
  title: string;
  tags: string[] | null;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

interface Bookmark extends ApiResponse {
  url: string;
}

interface Note extends ApiResponse {
  content: string;
}

interface Photo extends ApiResponse {
  description: string | null;
  imageUrl: string;
  mimeType: string;
}

interface Document extends ApiResponse {
  fileUrl: string;
  mimeType: string;
}

describe("POST /api/all Integration Tests", () => {
  // Rule 1: Test `assetType` in metadata overrides other rules
  it("should create a document when assetType is 'document', even for text content", async () => {
    await delay(100);
    const formData = new FormData();
    const metadata = { assetType: "document", title: "Forced Document" };
    const content = "This text would normally be a note.";

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([content], { type: "text/plain" }),
      "note.txt",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Document;
    expect(data.id).toMatch(/^doc-/);
    expect(data.title).toBe(metadata.title);
    expect(data.mimeType).toBe("text/plain");
  });

  // Rule 2: Test URI-list MIME type creates a bookmark
  it("should create a bookmark for mime type text/uri-list", async () => {
    await delay(100);
    const formData = new FormData();
    const url = "https://www.iana.org/";
    const metadata = { title: "IANA Website" };

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([url], { type: "text/uri-list" }),
      "link.url",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Bookmark;
    expect(data.id).toMatch(/^bm-/);
    expect(data.url).toBe(url);
    expect(data.title).toBe(metadata.title);
  });

  // Rule 3: Test text/plain content that is a valid URL creates a bookmark
  it("should create a bookmark for text/plain content that is a valid URL (with https)", async () => {
    await delay(100);
    const formData = new FormData();
    const url = "https://apple.com/iphone";

    formData.append("metadata", JSON.stringify({ tags: ["apple", "tech"] }));
    formData.append(
      "content",
      new Blob([url], { type: "text/plain" }),
      "url.txt",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Bookmark;
    expect(data.id).toMatch(/^bm-/);
    expect(data.url).toBe(url);
    expect(data.tags).toContain("apple");
  });

  // FIX: Test URL without protocol prefix
  it("should create a bookmark for text/plain content that is a valid URL (without prefix)", async () => {
    await delay(100);
    const formData = new FormData();
    const url = "google.com/maps";

    formData.append("metadata", JSON.stringify({ title: "Google Maps" }));
    formData.append(
      "content",
      new Blob([url], { type: "text/plain" }),
      "url.txt",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Bookmark;
    expect(data.id).toMatch(/^bm-/);
    expect(data.url).toBe(url);
    expect(data.title).toBe("Google Maps");
  });

  // Rule 4: Test text/plain content that is NOT a URL creates a note
  it("should create a note for text/plain content that is not a URL", async () => {
    await delay(100);
    const formData = new FormData();
    const noteContent = "This is a simple note about today's meeting.";
    const metadata = { title: "Meeting Notes" };

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([noteContent], { type: "text/plain" }),
      "meeting.txt",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Note;
    expect(data.id).toMatch(/^note-/);
    expect(data.title).toBe(metadata.title);
    expect(data.content).toBe(noteContent);
  });

  // Rule 5: Test image MIME type creates a photo
  it("should create a photo from a JPEG file", async () => {
    await delay(100);
    const formData = new FormData();
    const photoPath = resolve(
      import.meta.dirname,
      "../fixtures/photos/photo1.jpg",
    );
    const photoBuffer = await readFile(photoPath);
    const metadata = {
      title: "Test Landscape",
      description: "A beautiful landscape photo for testing.",
    };

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([photoBuffer as BlobPart], { type: "image/jpeg" }),
      "photo1.jpg",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Photo;
    expect(data.id).toMatch(/^photo-/);
    expect(data.title).toBe(metadata.title);
    expect(data.description).toBe(metadata.description);
    expect(data.imageUrl).toBeDefined();
    expect(data.mimeType).toBe("image/jpeg");
  });

  // Rule 6: Test document MIME type creates a document
  it("should create a document from a PDF file", async () => {
    await delay(100);
    const formData = new FormData();
    const docPath = resolve(
      import.meta.dirname,
      "../fixtures/documents/document2.pdf",
    );
    const docBuffer = await readFile(docPath);
    const metadata = { title: "Test PDF Document", tags: ["pdf", "test-doc"] };

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([docBuffer as BlobPart], { type: "application/pdf" }),
      "document2.pdf",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Document;
    expect(data.id).toMatch(/^doc-/);
    expect(data.title).toBe(metadata.title);
    expect(data.tags).toEqual(expect.arrayContaining(metadata.tags));
    expect(data.fileUrl).toBeDefined();
    expect(data.mimeType).toBe("application/pdf");
  });

  // Rule 6 (cont.): Test other document types without assetType hint
  it("should create a document for text/markdown content", async () => {
    await delay(100);
    const formData = new FormData();
    const mdContent = "# Markdown Header\n\nThis is a test.";
    formData.append("metadata", JSON.stringify({ title: "Markdown Test" }));
    formData.append(
      "content",
      new Blob([mdContent], { type: "text/markdown" }),
      "test.md",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Document;
    expect(data.id).toMatch(/^doc-/);
    expect(data.mimeType).toBe("text/markdown");
  });

  it("should create a document for text/html content that is not a URL", async () => {
    await delay(100);
    const formData = new FormData();
    const htmlContent = "<h1>HTML Content</h1><p>Not a URL.</p>";
    formData.append("metadata", JSON.stringify({ title: "HTML Test" }));
    formData.append(
      "content",
      new Blob([htmlContent], { type: "text/html" }),
      "test.html",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Document;
    expect(data.id).toMatch(/^doc-/);
    expect(data.mimeType).toBe("text/html");
  });

  // FIX: This test now correctly expects a note, per the rule hierarchy.
  it("should create a note for text/rtf content", async () => {
    await delay(100);
    const formData = new FormData();
    const rtfContent = "{\\rtf1\\ansi This is RTF content.}";
    formData.append("metadata", JSON.stringify({ title: "RTF Test" }));
    formData.append(
      "content",
      new Blob([rtfContent], { type: "text/rtf" }),
      "test.rtf",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Note;
    expect(data.id).toMatch(/^note-/);
  });

  // Rule 7: Test that unsupported content is rejected
  it("should reject content with an unsupported MIME type", async () => {
    await delay(100);
    const formData = new FormData();
    const unsupportedContent = "some random data";
    const unsupportedMime = "application/x-custom-unsupported-type";

    formData.append("metadata", JSON.stringify({ title: "Should Fail" }));
    formData.append(
      "content",
      new Blob([unsupportedContent], { type: unsupportedMime }),
      "fail.dat",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toContain("Unsupported content type");
    expect(data.message).toContain(unsupportedMime);
  });

  // --- Negative Tests for assetType Hinting ---
  it("should reject with 400 if assetType is 'bookmark' but content is not a valid URL", async () => {
    await delay(100);
    const formData = new FormData();
    const metadata = { assetType: "bookmark", title: "Invalid Bookmark" };
    const content = "this is definitely not a url";

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([content], { type: "text/plain" }),
      "invalid.txt",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid URL for bookmark");
  });

  // FIX: This test now correctly expects a 400 due to pre-service validation.
  it("should reject with 400 if assetType is 'photo' but content is not a valid image", async () => {
    await delay(100);
    const formData = new FormData();
    const metadata = { assetType: "photo", title: "Invalid Photo" };
    const content = "this is text, not an image file";

    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "content",
      new Blob([content], { type: "text/plain" }),
      "not-a-photo.txt",
    );

    const response = await loggedFetch(`${BASE_URL}/all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: formData,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Content is not a valid photo format.");
  });
});
