import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  BASE_URL,
  createAuthenticatedFetch,
  hasSameElements,
  TEST_API_KEY,
  TEST_API_KEY_2,
} from "../utils/test-helpers.js";
import type { Photo, PhotoListResponse } from "../utils/types.js";

const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);
const user2Fetch = createAuthenticatedFetch(TEST_API_KEY_2);

// Helper to create a photo via API, returns the response data
async function createTestPhoto(
  fetchFn: typeof loggedFetch,
  overrides: {
    title?: string;
    description?: string;
    tags?: string[];
    deviceId?: string;
    originalFilename?: string;
    reviewStatus?: string;
    isPinned?: boolean;
    dueDate?: string;
    fileContent?: string;
    fileMimeType?: string;
    enabled?: boolean;
  } = {},
): Promise<Photo> {
  const fileContent = overrides.fileContent ?? "dummy image content";
  const fileMimeType = overrides.fileMimeType ?? "image/jpeg";
  const originalFilename = overrides.originalFilename ?? "test-photo.jpg";

  const dummyFile = new Blob([fileContent], { type: fileMimeType });
  const formData = new FormData();
  const metadata: Record<string, unknown> = {
    title: overrides.title ?? `Test Photo ${Date.now()}`,
    description: overrides.description ?? "Test photo description",
    tags: overrides.tags ?? [],
    deviceId: overrides.deviceId ?? "vitest",
    originalFilename,
  };
  if (overrides.reviewStatus !== undefined)
    metadata.reviewStatus = overrides.reviewStatus;
  if (overrides.isPinned !== undefined) metadata.isPinned = overrides.isPinned;
  if (overrides.dueDate !== undefined) metadata.dueDate = overrides.dueDate;
  if (overrides.enabled !== undefined) metadata.enabled = overrides.enabled;

  formData.append("metadata", JSON.stringify(metadata));
  formData.append("content", dummyFile, originalFilename);

  const response = await fetchFn(`${BASE_URL}/photos`, {
    method: "POST",
    body: formData,
  });

  expect(response.status, "createTestPhoto failed").toBe(201);
  return (await response.json()) as Photo;
}

// Helper to delete a photo, swallowing errors for cleanup
async function deleteTestPhoto(
  fetchFn: typeof loggedFetch,
  photoId: string,
): Promise<void> {
  try {
    await fetchFn(`${BASE_URL}/photos/${photoId}`, { method: "DELETE" });
  } catch {
    // Swallow cleanup errors
  }
}

// --- Test Suite 1: Full CRUD Cycle ---
describe("Photo API - CRUD Cycle", () => {
  let createdPhotoId: string | null = null;
  let createdPhotoData: Photo | null = null;

  const initialMetadata = {
    title: `CRUD Test Photo ${Date.now()}`,
    description: "Test photo for CRUD cycle.",
    tags: ["test", "api", "upload"],
    deviceId: "Vitest Test Runner",
    reviewStatus: "pending" as const,
    isPinned: false,
    dueDate: "2025-12-31T23:59:59Z",
  };

  const patchData = {
    title: `UPDATED Photo ${Date.now()}`,
    description: "This is the updated description.",
    tags: ["test", "api", "updated"],
    reviewStatus: "accepted" as const,
    isPinned: true,
    flagColor: "green" as const,
    dueDate: "2025-06-15T09:00:00Z",
  };

  afterAll(async () => {
    if (createdPhotoId) {
      await deleteTestPhoto(loggedFetch, createdPhotoId);
    }
  });

  it("POST /api/photos - should create a new photo", async () => {
    const data = await createTestPhoto(loggedFetch, {
      title: initialMetadata.title,
      description: initialMetadata.description,
      tags: initialMetadata.tags,
      deviceId: initialMetadata.deviceId,
      originalFilename: "test-photo.png",
      fileMimeType: "image/png",
      reviewStatus: initialMetadata.reviewStatus,
      isPinned: initialMetadata.isPinned,
      dueDate: initialMetadata.dueDate,
    });

    createdPhotoData = data;
    createdPhotoId = data.id;

    expect(data.id).toBeTypeOf("string");
    expect(data.id).toMatch(/^photo-[A-Za-z0-9]{15}$/);
    expect(data.title).toBe(initialMetadata.title);
    expect(data.description).toBe(initialMetadata.description);
    expect(data.imageUrl).toBe(`/api/photos/${data.id}/view`);
    expect(data.originalFilename).toBe("test-photo.png");
    expect(data.mimeType).toBe("image/png");
    expect(data.deviceId).toBe(initialMetadata.deviceId);
    expect(hasSameElements(data.tags, initialMetadata.tags)).toBe(true);
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");
    expect(data.reviewStatus).toBe(initialMetadata.reviewStatus);
    expect(data.isPinned).toBe(initialMetadata.isPinned);
    expect(new Date(data.dueDate!).toISOString()).toBe(
      new Date(initialMetadata.dueDate).toISOString(),
    );
    expect(data.flagColor).toBeNull();
    expect(data.isOriginalViewable).toBeTypeOf("boolean");
  });

  it("GET /api/photos/:id - should retrieve the created photo", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(
      `${BASE_URL}/photos/${createdPhotoId}`,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.id).toBe(createdPhotoData!.id);
    expect(data.title).toBe(createdPhotoData!.title);
    expect(data.description).toBe(createdPhotoData!.description);
    expect(data.imageUrl).toBe(createdPhotoData!.imageUrl);
    expect(data.originalFilename).toBe(createdPhotoData!.originalFilename);
    expect(data.mimeType).toBe(createdPhotoData!.mimeType);
    expect(data.fileSize).toBe(createdPhotoData!.fileSize);
    expect(data.deviceId).toBe(createdPhotoData!.deviceId);
    expect(hasSameElements(data.tags, createdPhotoData!.tags)).toBe(true);
  });

  it("GET /api/photos - should list photos including the new one", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(`${BASE_URL}/photos`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("limit");
    expect(data).toHaveProperty("offset");
    expect(data.items).toBeInstanceOf(Array);
    expect(data.totalCount).toBeGreaterThan(0);
    expect(data.items.length).toBeGreaterThan(0);

    const found = data.items.find((p) => p.id === createdPhotoId);
    expect(found, `Photo ${createdPhotoId} not found in list`).toBeDefined();
    expect(found?.title).toBe(createdPhotoData!.title);
  });

  it("PATCH /api/photos/:id - should update photo metadata", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(
      `${BASE_URL}/photos/${createdPhotoId}`,
      {
        method: "PATCH",
        body: JSON.stringify(patchData),
      },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.id).toBe(createdPhotoId);
    expect(data.title).toBe(patchData.title);
    expect(data.description).toBe(patchData.description);
    expect(hasSameElements(data.tags, patchData.tags)).toBe(true);
    expect(data.originalFilename).toBe(createdPhotoData!.originalFilename);
    expect(data.mimeType).toBe(createdPhotoData!.mimeType);
    expect(data.fileSize).toBe(createdPhotoData!.fileSize);
    expect(data.reviewStatus).toBe(patchData.reviewStatus);
    expect(data.isPinned).toBe(patchData.isPinned);
    expect(data.flagColor).toBe(patchData.flagColor);
    expect(new Date(data.dueDate!).toISOString()).toBe(
      new Date(patchData.dueDate).toISOString(),
    );
  });

  it("PUT /api/photos/:id - should fully update photo metadata", async () => {
    expect(createdPhotoId).not.toBeNull();
    const putData = {
      title: `PUT Updated Photo ${Date.now()}`,
      description: "Full update via PUT",
      tags: ["put-test"],
      reviewStatus: "rejected" as const,
      isPinned: false,
      flagColor: "blue" as const,
      dueDate: "2026-01-01T00:00:00Z",
    };
    const response = await loggedFetch(
      `${BASE_URL}/photos/${createdPhotoId}`,
      {
        method: "PUT",
        body: JSON.stringify(putData),
      },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.title).toBe(putData.title);
    expect(data.description).toBe(putData.description);
    expect(hasSameElements(data.tags, putData.tags)).toBe(true);
    expect(data.reviewStatus).toBe(putData.reviewStatus);
    expect(data.flagColor).toBe(putData.flagColor);
  });

  it("GET /api/photos/:id - should retrieve the updated photo", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(
      `${BASE_URL}/photos/${createdPhotoId}`,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.id).toBe(createdPhotoId);
    // Verify it reflects the PUT data
    expect(data.description).toBe("Full update via PUT");
  });

  it("DELETE /api/photos/:id - should delete the photo", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(
      `${BASE_URL}/photos/${createdPhotoId}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(204);
  });

  it("GET /api/photos/:id - should return 404 after deletion", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(
      `${BASE_URL}/photos/${createdPhotoId}`,
    );
    expect(response.status).toBe(404);
  });

  it("GET /api/photos - should not list the deleted photo", async () => {
    expect(createdPhotoId).not.toBeNull();
    const response = await loggedFetch(`${BASE_URL}/photos`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toBeInstanceOf(Array);
    const found = data.items.find((p) => p.id === createdPhotoId);
    expect(found, "Deleted photo should not appear in list").toBeUndefined();

    createdPhotoId = null;
    createdPhotoData = null;
  });
});

// --- Test Suite 2: Real File Uploads with EXIF Verification ---
describe("Photo API - Real File Uploads", () => {
  const createdPhotoIds: string[] = [];

  afterAll(async () => {
    for (const id of createdPhotoIds) {
      await deleteTestPhoto(loggedFetch, id);
    }
  });

  const testFiles = [
    {
      filename: "photo1.jpg",
      mimeType: "image/jpeg",
      titleSuffix: "Food Pic",
      tags: ["food", "restaurant"],
    },
    {
      filename: "photo2.JPEG",
      mimeType: "image/jpeg",
      titleSuffix: "Village",
      tags: ["house", "tree", "painting"],
    },
    {
      filename: "photo3.png",
      mimeType: "image/png",
      titleSuffix: "Kitchen Scene",
      tags: ["kitchen", "modern"],
    },
    {
      filename: "photo4.HEIC",
      mimeType: "image/heic",
      titleSuffix: "Apple Format",
      tags: [],
    },
  ];

  it.each(testFiles)(
    "POST /api/photos - should upload $filename successfully",
    async ({ filename, mimeType, titleSuffix, tags }) => {
      const filePath = path.join(
        process.cwd(),
        "src",
        "tests",
        "fixtures",
        "photos",
        filename,
      );
      const fileBuffer = await fs.readFile(filePath);
      const fileSize = fileBuffer.length;
      const fileBlob = new Blob([fileBuffer as BlobPart], { type: mimeType });

      const formData = new FormData();
      const title = `Real Upload ${titleSuffix} ${Date.now()}`;
      const metadata = {
        title,
        description: `Uploaded file: ${filename}`,
        tags,
        deviceId: "Vitest Real File Test",
        originalFilename: filename,
      };
      formData.append("metadata", JSON.stringify(metadata));
      formData.append("content", fileBlob, filename);

      const response = await loggedFetch(`${BASE_URL}/photos`, {
        method: "POST",
        body: formData,
      });

      expect(response.status, `POST failed for ${filename}`).toBe(201);
      const data = (await response.json()) as Photo;
      createdPhotoIds.push(data.id);

      expect(data.id).toMatch(/^photo-[A-Za-z0-9]{15}$/);
      expect(data.title).toBe(title);
      expect(data.originalFilename).toBe(filename);
      expect(data.mimeType).toBe(mimeType);
      expect(data.fileSize).toBe(fileSize);
      expect(hasSameElements(data.tags, tags)).toBe(true);
      expect(data.deviceId).toBe("Vitest Real File Test");
    },
  );

  it("should have extracted EXIF data from JPEG fixtures", async () => {
    // photo1.jpg and photo2.JPEG are real JPEG files with EXIF data
    // Verify EXIF was extracted by fetching the created photos
    const jpegIds = createdPhotoIds.slice(0, 2); // First two are JPEGs
    for (const photoId of jpegIds) {
      const response = await loggedFetch(`${BASE_URL}/photos/${photoId}`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as Photo;

      // Real JPEG fixtures should have image dimensions extracted
      expect(
        data.imageWidth,
        `imageWidth should be extracted for ${photoId}`,
      ).toBeTypeOf("number");
      expect(
        data.imageHeight,
        `imageHeight should be extracted for ${photoId}`,
      ).toBeTypeOf("number");
      expect(data.imageWidth).toBeGreaterThan(0);
      expect(data.imageHeight).toBeGreaterThan(0);
    }
  });

  it("should mark HEIC as not originally viewable", async () => {
    // photo4.HEIC is the last uploaded file
    const heicId = createdPhotoIds[3];
    if (!heicId) return; // Skip if HEIC upload failed

    const response = await loggedFetch(`${BASE_URL}/photos/${heicId}`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.isOriginalViewable).toBe(false);
    expect(data.mimeType).toBe("image/heic");
  });

  it("should mark JPEG as originally viewable", async () => {
    const jpegId = createdPhotoIds[0];
    if (!jpegId) return;

    const response = await loggedFetch(`${BASE_URL}/photos/${jpegId}`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.isOriginalViewable).toBe(true);
  });
});

// --- Test Suite 3: Workflow Management Endpoints ---
describe("Photo API - Workflow Management", () => {
  let testPhotoId: string | null = null;

  beforeAll(async () => {
    const data = await createTestPhoto(loggedFetch, {
      title: `Workflow Test Photo ${Date.now()}`,
      tags: ["workflow", "test"],
      reviewStatus: "pending",
      isPinned: false,
    });
    testPhotoId = data.id;
  });

  afterAll(async () => {
    if (testPhotoId) await deleteTestPhoto(loggedFetch, testPhotoId);
  });

  it("PATCH /api/photos/:id/review - should update review status", async () => {
    expect(testPhotoId).not.toBeNull();

    // Test updating to accepted
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/review`,
      {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "accepted" }),
      },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.reviewStatus).toBe("accepted");
    expect(data.id).toBe(testPhotoId);

    // Test updating to rejected
    const rejectResponse = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/review`,
      {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "rejected" }),
      },
    );
    expect(rejectResponse.status).toBe(200);
    const rejectResult = (await rejectResponse.json()) as Photo;
    expect(rejectResult.reviewStatus).toBe("rejected");
  });

  it("PATCH /api/photos/:id/flag - should update flag color", async () => {
    expect(testPhotoId).not.toBeNull();

    // Set flag
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/flag`,
      {
        method: "PATCH",
        body: JSON.stringify({ flagColor: "red" }),
      },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.flagColor).toBe("red");

    // Clear flag
    const clearResponse = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/flag`,
      {
        method: "PATCH",
        body: JSON.stringify({ flagColor: null }),
      },
    );
    expect(clearResponse.status).toBe(200);
    const clearResult = (await clearResponse.json()) as Photo;
    expect(clearResult.flagColor).toBeNull();
  });

  it("PATCH /api/photos/:id/pin - should toggle pin status", async () => {
    expect(testPhotoId).not.toBeNull();

    // Pin
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/pin`,
      {
        method: "PATCH",
        body: JSON.stringify({ isPinned: true }),
      },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as Photo).isPinned).toBe(true);

    // Unpin
    const unpinResponse = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/pin`,
      {
        method: "PATCH",
        body: JSON.stringify({ isPinned: false }),
      },
    );
    expect(unpinResponse.status).toBe(200);
    expect(((await unpinResponse.json()) as Photo).isPinned).toBe(false);
  });

  it("should return 404 for workflow endpoints with invalid ID", async () => {
    const invalidId = "photo-nonexistent999";
    const endpoints = ["review", "flag", "pin"];
    const bodies = [
      { reviewStatus: "accepted" },
      { flagColor: "red" },
      { isPinned: true },
    ];

    for (let i = 0; i < endpoints.length; i++) {
      const response = await loggedFetch(
        `${BASE_URL}/photos/${invalidId}/${endpoints[i]}`,
        {
          method: "PATCH",
          body: JSON.stringify(bodies[i]),
        },
      );
      expect(
        response.status,
        `Expected 404 for ${endpoints[i]} with invalid ID`,
      ).toBe(404);
    }
  });
});

// --- Test Suite 4: File Serving Endpoints ---
describe("Photo API - File Serving", () => {
  let testPhotoId: string | null = null;

  beforeAll(async () => {
    const data = await createTestPhoto(loggedFetch, {
      title: `File Serving Test ${Date.now()}`,
      tags: ["file-serving", "test"],
      originalFilename: "file-serving-test.jpg",
    });
    testPhotoId = data.id;
  });

  afterAll(async () => {
    if (testPhotoId) await deleteTestPhoto(loggedFetch, testPhotoId);
  });

  it("GET /api/photos/:id/view - should serve photo for viewing", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/view`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=3600",
    );
    const content = await response.arrayBuffer();
    expect(content.byteLength).toBeGreaterThan(0);
  });

  it("GET /api/photos/:id/thumbnail - should handle thumbnail", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/thumbnail`,
    );
    // Thumbnail may not be generated yet (async processing)
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toMatch(/^image\//);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=86400",
      );
      const content = await response.arrayBuffer();
      expect(content.byteLength).toBeGreaterThan(0);
    } else {
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/original - should serve original file", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/original`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=3600",
    );
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(response.headers.get("Content-Disposition")).toContain(
      "file-serving-test.jpg",
    );
    const content = await response.arrayBuffer();
    expect(content.byteLength).toBeGreaterThan(0);
  });

  it("GET /api/photos/:id/converted - should handle converted JPG", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/converted`,
    );
    // Converted file may not exist for a JPEG
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      const content = await response.arrayBuffer();
      expect(content.byteLength).toBeGreaterThan(0);
    } else {
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/analysis - should handle AI analysis", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/analysis`,
    );
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toContain(
        "application/json",
      );
      const content = await response.text();
      expect(content.length).toBeGreaterThan(0);
      const analysisData = JSON.parse(content);
      expect(analysisData).toBeTypeOf("object");
    } else {
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/content - should handle content markdown", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/content`,
    );
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toContain("text/markdown");
      const content = await response.text();
      expect(content.length).toBeGreaterThan(0);
    } else {
      expect(response.status).toBe(404);
    }
  });

  it("should return 404 for file serving with invalid ID", async () => {
    const invalidId = "photo-nonexistent999";
    const endpoints = [
      "view",
      "thumbnail",
      "original",
      "converted",
      "analysis",
      "content",
    ];

    for (const endpoint of endpoints) {
      const response = await loggedFetch(
        `${BASE_URL}/photos/${invalidId}/${endpoint}`,
      );
      expect(
        response.status,
        `Expected 404 for /${endpoint} with invalid ID`,
      ).toBe(404);
    }
  });

  it("should reject unauthenticated access to file serving endpoints", async () => {
    const endpoints = [
      "view",
      "thumbnail",
      "original",
      "converted",
      "analysis",
      "content",
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(
        `${BASE_URL}/photos/${testPhotoId}/${endpoint}`,
      );
      expect(
        [401, 403],
        `Expected 401/403 for unauthenticated /${endpoint}`,
      ).toContain(response.status);
    }
  });
});

// --- Test Suite 5: Search and Filtering ---
describe("Photo API - Search and Filtering", () => {
  const searchTestPhotos: string[] = [];

  const photoConfigs = [
    {
      title: "Beach Sunset Photo",
      description: "Beautiful sunset at the beach",
      tags: ["sunset", "beach", "nature"],
      deviceId: "camera-001",
    },
    {
      title: "Mountain Landscape",
      description: "Scenic mountain view",
      tags: ["mountain", "landscape", "nature"],
      deviceId: "camera-002",
    },
    {
      title: "City Street Photography",
      description: "Urban street scene",
      tags: ["city", "street", "urban"],
      deviceId: "camera-001",
    },
    {
      title: "Family Portrait",
      description: "Family photo at home",
      tags: ["family", "portrait", "indoor"],
      deviceId: "phone-001",
    },
  ];

  beforeAll(async () => {
    for (const config of photoConfigs) {
      const data = await createTestPhoto(loggedFetch, {
        title: config.title,
        description: config.description,
        tags: config.tags,
        deviceId: config.deviceId,
        originalFilename: `${config.title.toLowerCase().replace(/\s+/g, "-")}.jpg`,
      });
      searchTestPhotos.push(data.id);
    }
  });

  afterAll(async () => {
    for (const photoId of searchTestPhotos) {
      await deleteTestPhoto(loggedFetch, photoId);
    }
  });

  it("GET /api/photos?tags=nature - should filter by single tag", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?tags=nature`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toBeInstanceOf(Array);
    expect(data.totalCount).toBeGreaterThan(0);

    const foundPhotos = data.items.filter(
      (p) => searchTestPhotos.includes(p.id) && p.tags.includes("nature"),
    );
    expect(
      foundPhotos.length,
      "Should find photos with 'nature' tag",
    ).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/photos?tags=nature,landscape - should filter by multiple tags (AND)", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?tags=nature,landscape`,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toBeInstanceOf(Array);
    const foundPhotos = data.items.filter(
      (p) =>
        searchTestPhotos.includes(p.id) &&
        p.tags.includes("nature") &&
        p.tags.includes("landscape"),
    );
    expect(
      foundPhotos.length,
      "Should find photos with both 'nature' AND 'landscape' tags",
    ).toBeGreaterThan(0);
  });

  it("GET /api/photos?tags=nonexistent - should return empty for no matches", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?tags=veryspecificnonexistenttag12345`,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBe(0);
    expect(data.totalCount).toBe(0);
  });

  it("GET /api/photos?limit=2 - should limit results", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?limit=2`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items.length).toBeLessThanOrEqual(2);
    expect(data.limit).toBe(2);
    expect(data.totalCount).toBeGreaterThan(0);
  });

  it("GET /api/photos?startDate&endDate - should filter by date range", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?startDate=2024-01-01&endDate=2030-12-31`,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;

    expect(data.items).toBeInstanceOf(Array);
    expect(data.totalCount).toBeGreaterThan(0);

    const foundTestPhotos = data.items.filter((p) =>
      searchTestPhotos.includes(p.id),
    );
    expect(foundTestPhotos.length).toBeGreaterThan(0);
  });

  it("GET /api/photos?limit=invalid - should reject invalid parameters", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?limit=invalid`);
    expect(response.status).toBe(400);
    const errorData = await response.json();
    expect(errorData).toHaveProperty("error");
  });
});

// --- Test Suite 6: Multi-User Isolation ---
describe("Photo API - Multi-User Isolation", () => {
  let user1PhotoId: string | null = null;

  beforeAll(async () => {
    const data = await createTestPhoto(loggedFetch, {
      title: `User1 Photo ${Date.now()}`,
      tags: ["user1-only"],
      description: "This photo belongs to user 1",
    });
    user1PhotoId = data.id;
  });

  afterAll(async () => {
    if (user1PhotoId) await deleteTestPhoto(loggedFetch, user1PhotoId);
  });

  it("user 2 should not see user 1's photo in list", async () => {
    const response = await user2Fetch(`${BASE_URL}/photos`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoListResponse;
    const found = data.items.find((p) => p.id === user1PhotoId);
    expect(
      found,
      "User 2 should not see user 1's photo",
    ).toBeUndefined();
  });

  it("user 2 should get 404 when accessing user 1's photo by ID", async () => {
    const response = await user2Fetch(
      `${BASE_URL}/photos/${user1PhotoId}`,
    );
    expect(response.status).toBe(404);
  });

  it("user 2 should get 404 when trying to update user 1's photo", async () => {
    const response = await user2Fetch(
      `${BASE_URL}/photos/${user1PhotoId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Hacked!" }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("user 2 should get 404 when trying to delete user 1's photo", async () => {
    const response = await user2Fetch(
      `${BASE_URL}/photos/${user1PhotoId}`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(404);
  });

  it("user 2 should get 404 when accessing user 1's photo files", async () => {
    const endpoints = ["view", "thumbnail", "original"];
    for (const endpoint of endpoints) {
      const response = await user2Fetch(
        `${BASE_URL}/photos/${user1PhotoId}/${endpoint}`,
      );
      expect(
        response.status,
        `User 2 should not access /${endpoint}`,
      ).toBe(404);
    }
  });

  it("user 1's photo should still exist after user 2's failed attempts", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${user1PhotoId}`,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as Photo;
    expect(data.title).toContain("User1 Photo");
  });
});

// --- Test Suite 7: Upload Validation ---
describe("Photo API - Upload Validation", () => {
  it("should reject upload without content part", async () => {
    const formData = new FormData();
    formData.append(
      "metadata",
      JSON.stringify({ title: "No content", tags: [] }),
    );

    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      body: formData,
    });
    expect(response.status).toBe(400);
  });

  it("should reject non-image file upload", async () => {
    const textContent = "This is plain text, not an image.";
    const textFile = new Blob([textContent], { type: "text/plain" });

    const formData = new FormData();
    formData.append(
      "metadata",
      JSON.stringify({ title: "Not an image", tags: [] }),
    );
    formData.append("content", textFile, "document.txt");

    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      body: formData,
    });
    expect(response.status).toBe(400);
  });
});

// --- Test Suite 8: Reprocess Endpoint ---
describe("Photo API - Reprocess", () => {
  let testPhotoId: string | null = null;

  beforeAll(async () => {
    const data = await createTestPhoto(loggedFetch, {
      title: `Reprocess Test ${Date.now()}`,
    });
    testPhotoId = data.id;
  });

  afterAll(async () => {
    if (testPhotoId) await deleteTestPhoto(loggedFetch, testPhotoId);
  });

  it("POST /api/photos/:id/reprocess - should accept reprocess request", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/reprocess`,
      { method: "POST" },
    );
    // Should succeed (200 or 202) or potentially 404 if route not registered
    expect([200, 202]).toContain(response.status);
  });

  it("POST /api/photos/:id/reprocess - should return 404 for invalid ID", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos/photo-nonexistent999/reprocess`,
      { method: "POST" },
    );
    expect(response.status).toBe(404);
  });
});
