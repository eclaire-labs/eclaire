import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Make sure Blob is available
// import { Blob } from 'node:buffer'; // Uncomment if needed for Node < 15 or specific envs

// Node.js built-in modules for file handling
import { promises as fs } from "fs";
import path from "path";
import {
  BASE_URL,
  delay,
  hasSameElements,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// Create authenticated fetch function with X-API-Key header
const loggedFetch = async (url: string, options: RequestInit = {}) => {
  const headers = {
    ...((options.headers as Record<string, string>) || {}),
    "X-API-Key": TEST_API_KEY,
  };

  return fetch(url, { ...options, headers });
};

// Helper function to ensure photo was created successfully
const ensurePhotoCreated = (
  photoId: string | null,
  photoData: PhotoResponse | null,
) => {
  if (!photoId || !photoData) {
    throw new Error(
      `Test setup failed: Photo creation unsuccessful. photoId=${photoId}, photoData=${photoData ? "exists" : "null"}`,
    );
  }
};

// Custom interface for Photos API response (matching actual PhotoResponseSchema)
interface PhotoResponse {
  id: string;
  title: string;
  description: string | null;

  // Display URLs
  imageUrl: string;
  thumbnailUrl: string | null;

  // Basic metadata
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  dateTaken: string | null;
  deviceId: string | null;

  // File information
  originalFilename: string;
  mimeType: string;
  fileSize: number;

  // EXIF Data
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  orientation: number | null;
  imageWidth: number | null;
  imageHeight: number | null;

  // Location Data
  latitude: number | null;
  longitude: number | null;
  altitude?: number | null;
  locationCity: string | null;
  locationCountryIso2: string | null;
  locationCountryName: string | null;

  // AI Generated Data
  photoType: string | null;
  ocrText: string | null;
  dominantColors: string[] | null;

  // Review and Workflow
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;

  // Processing Status
  processingStatus: string;

  // Storage and Technical Information (some are not returned in API response)
  storageId?: string;
  thumbnailStorageId?: string | null;
  convertedJpgStorageId?: string | null;
  isOriginalViewable: boolean;
}

// Photos list response interface
interface PhotosListResponse {
  photos: PhotoResponse[];
  totalCount: number;
  limit: number;
}

// --- Test Suite 1: Full CRUD Cycle with Dummy File ---
describe("Photo API Integration Tests (CRUD Cycle)", () => {
  let createdPhotoId: string | null = null;
  let createdPhotoData: PhotoResponse | null = null;

  const initialMetadata = {
    title: `Test Photo ${Date.now()}`,
    description: "This is a test photo description created via API test.",
    tags: "test,api,upload",
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

  it("POST /api/photos - should create a new photo entry with DUMMY file upload", async () => {
    await delay(100);
    const dummyFileContent = "This is dummy file content for testing.";
    const dummyFile = new Blob([dummyFileContent], { type: "image/png" });

    const formData = new FormData();
    const metadata = {
      title: initialMetadata.title,
      description: initialMetadata.description,
      tags: initialMetadata.tags.split(",").map((tag) => tag.trim()),
      deviceId: initialMetadata.deviceId,
      originalFilename: "test-photo.png",
      reviewStatus: initialMetadata.reviewStatus,
      isPinned: initialMetadata.isPinned,
      dueDate: initialMetadata.dueDate,
    };
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("content", dummyFile, "test-photo.png");

    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      headers: { "X-API-Key": TEST_API_KEY },
      body: formData,
    });

    expect(
      response.status,
      `POST failed with status ${response.status}. Check API logs.`,
    ).toBe(201);
    const data = (await response.json()) as PhotoResponse;
    createdPhotoData = data;
    createdPhotoId = data.id; // Set ID early to ensure it's available for subsequent tests

    expect(data).toBeDefined();
    expect(data.id).toBeTypeOf("string");
    expect(data.id).toMatch(/^photo-[A-Za-z0-9]{15}$/);
    expect(data.title).toBe(initialMetadata.title);
    expect(data.description).toBe(initialMetadata.description);
    expect(data.imageUrl).toBe(`/api/photos/${data.id}/view`);
    expect(data.originalFilename).toBe("test-photo.png");
    expect(data.mimeType).toBe("image/png");
    expect(data.fileSize).toBe(dummyFileContent.length);
    expect(data.deviceId).toBe(initialMetadata.deviceId);
    // Use hasSameElements for tag comparison, converting string to array first
    expect(hasSameElements(data.tags, initialMetadata.tags.split(","))).toBe(
      true,
    );
    expect(data.createdAt).toBeTypeOf("string");
    expect(data.updatedAt).toBeTypeOf("string");

    // Test new workflow fields
    expect(data.reviewStatus).toBe(initialMetadata.reviewStatus);
    expect(data.isPinned).toBe(initialMetadata.isPinned);
    // Compare normalized dates (API may return with milliseconds)
    expect(new Date(data.dueDate!).toISOString()).toBe(
      new Date(initialMetadata.dueDate).toISOString(),
    );
    expect(data.flagColor).toBeNull(); // Should be null initially
    expect(data.processingStatus).toBeTypeOf("string");
    expect(data.isOriginalViewable).toBeTypeOf("boolean");

    expect(createdPhotoId).not.toBeNull();
  });

  it("GET /api/photos/:id - should retrieve the created photo entry", async () => {
    ensurePhotoCreated(createdPhotoId, createdPhotoData);
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos/${createdPhotoId}`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoResponse;
    expect(data.id).toBe(createdPhotoData!.id);
    expect(data.title).toBe(createdPhotoData!.title);
    expect(data.description).toBe(createdPhotoData!.description);
    expect(data.imageUrl).toBe(createdPhotoData!.imageUrl);
    expect(data.originalFilename).toBe(createdPhotoData!.originalFilename);
    expect(data.mimeType).toBe(createdPhotoData!.mimeType);
    expect(data.fileSize).toBe(createdPhotoData!.fileSize);
    expect(data.deviceId).toBe(createdPhotoData!.deviceId);
    expect(hasSameElements(data.tags, createdPhotoData!.tags)).toBe(true);
    expect(data.createdAt).toBe(createdPhotoData!.createdAt);
  });

  it("GET /api/photos - should list photo entries including the new one", async () => {
    ensurePhotoCreated(createdPhotoId, createdPhotoData);
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(response.status).toBe(200);
    const responseData = (await response.json()) as PhotosListResponse;

    // Validate response structure
    expect(responseData).toHaveProperty("photos");
    expect(responseData).toHaveProperty("totalCount");
    expect(responseData).toHaveProperty("limit");
    expect(responseData.photos).toBeInstanceOf(Array);
    expect(responseData.totalCount).toBeGreaterThan(0);
    expect(responseData.photos.length).toBeGreaterThan(0);

    const found = responseData.photos.find((p) => p.id === createdPhotoId);
    expect(
      found,
      `Photo with ID ${createdPhotoId} not found in the list`,
    ).toBeDefined();
    expect(found?.title).toBe(createdPhotoData!.title);
  });

  it("PATCH /api/photos/:id - should update the photo metadata", async () => {
    ensurePhotoCreated(createdPhotoId, createdPhotoData);
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos/${createdPhotoId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TEST_API_KEY,
      },
      body: JSON.stringify(patchData),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdPhotoId);
    expect(data.title).toBe(patchData.title);
    expect(data.description).toBe(patchData.description);
    expect(hasSameElements(data.tags, patchData.tags)).toBe(true);
    expect(data.imageUrl).toBe(createdPhotoData!.imageUrl);
    expect(data.originalFilename).toBe(createdPhotoData!.originalFilename);
    expect(data.mimeType).toBe(createdPhotoData!.mimeType);
    expect(data.fileSize).toBe(createdPhotoData!.fileSize);
    expect(data.deviceId).toBe(createdPhotoData!.deviceId);
    expect(data.createdAt).toBe(createdPhotoData!.createdAt);
    expect(data.updatedAt).toBeTypeOf("string");
    expect(data.updatedAt.length).toBeGreaterThan(5);

    // Test updated workflow fields
    expect(data.reviewStatus).toBe(patchData.reviewStatus);
    expect(data.isPinned).toBe(patchData.isPinned);
    expect(data.flagColor).toBe(patchData.flagColor);
    // Compare normalized dates (API may return with milliseconds)
    expect(new Date(data.dueDate!).toISOString()).toBe(
      new Date(patchData.dueDate).toISOString(),
    );
  });

  it("GET /api/photos/:id - should retrieve the updated photo entry", async () => {
    expect(
      createdPhotoId,
      "Test setup failed: createdPhotoId is null",
    ).not.toBeNull();
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos/${createdPhotoId}`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoResponse;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdPhotoId);
    expect(data.title).toBe(patchData.title);
    expect(data.description).toBe(patchData.description);
    expect(hasSameElements(data.tags, patchData.tags)).toBe(true);

    // Validate updated workflow fields
    expect(data.reviewStatus).toBe(patchData.reviewStatus);
    expect(data.isPinned).toBe(patchData.isPinned);
    expect(data.flagColor).toBe(patchData.flagColor);
    // Compare normalized dates (API may return with milliseconds)
    expect(new Date(data.dueDate!).toISOString()).toBe(
      new Date(patchData.dueDate).toISOString(),
    );
  });

  it("DELETE /api/photos/:id - should delete the photo entry", async () => {
    expect(
      createdPhotoId,
      "Test setup failed: createdPhotoId is null",
    ).not.toBeNull();
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos/${createdPhotoId}`, {
      method: "DELETE",
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(response.status).toBe(204);
  });

  it("GET /api/photos/:id - should return 404 for the deleted photo entry", async () => {
    expect(
      createdPhotoId,
      "Test cleanup check requires createdPhotoId",
    ).not.toBeNull();
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos/${createdPhotoId}`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(response.status).toBe(404);
  });

  it("GET /api/photos - should not list the deleted entry", async () => {
    expect(
      createdPhotoId,
      "Test cleanup check requires createdPhotoId",
    ).not.toBeNull();
    await delay(100);
    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(response.status).toBe(200);
    const responseData = (await response.json()) as PhotosListResponse;

    // Validate response structure
    expect(responseData).toHaveProperty("photos");
    expect(responseData).toHaveProperty("totalCount");
    expect(responseData).toHaveProperty("limit");
    expect(responseData.photos).toBeInstanceOf(Array);

    const found = responseData.photos.find((p) => p.id === createdPhotoId);
    expect(
      found,
      `Deleted photo with ID ${createdPhotoId} still found in the list`,
    ).toBeUndefined();

    // Reset global state variables
    createdPhotoId = null;
    createdPhotoData = null;
  });
}); // End describe block for CRUD Cycle

// --- Test Suite 2: Real File Uploads ---
describe("Photo API Integration Tests (Real File Uploads)", () => {
  // Define the test files residing in src/tests/fixtures/images/
  // IMPORTANT: Ensure these files exist and the MIME types are in ALLOWED_MIME_TYPES in your API route
  //            Especially add 'image/heic' and/or 'image/heif' for test-photo4.HEIC
  const testFiles = [
    {
      filename: "photo1.jpg",
      mimeType: "image/jpeg",
      titleSuffix: "Food Pic",
      tags: ["food", "restaurant"],
    },
    {
      filename: "photo2.JPEG", // Note: Filename case matters for reading file
      mimeType: "image/jpeg", // Standard MIME type is lowercase
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
      filename: "photo4.HEIC", // Note: Filename case matters for reading file
      mimeType: "image/heic", // Ensure this is in API's ALLOWED_MIME_TYPES
      titleSuffix: "Apple Format",
      tags: [], // Empty tags array
    },
  ];

  // Use it.each to run the test for each file defined above
  it.each(
    testFiles,
  )("POST /api/photos - should upload $filename successfully with tags [$tags]", async ({
    filename,
    mimeType,
    titleSuffix,
    tags,
  }) => {
    await delay(50); // Small delay between uploads if needed

    // *** UPDATED PATH ***
    const filePath = path.join(
      process.cwd(),
      "src",
      "tests",
      "fixtures",
      "photos",
      filename,
    );
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch (err) {
      console.error(`Error reading test file: ${filePath}`, err);
      throw new Error(
        `Test setup failed: Could not read file ${filename}. Make sure it exists in ${path.dirname(filePath)}`,
      );
    }

    const fileSize = fileBuffer.length;
    // Create Blob from file buffer
    const fileBlob = new Blob([fileBuffer as BlobPart], { type: mimeType });

    // Create FormData for this specific file
    const formData = new FormData();
    const title = `Real Upload ${titleSuffix} ${Date.now()}`;
    const metadata = {
      title,
      description: `Uploaded file: ${filename} with tags: ${tags.join(", ")}`,
      tags,
      deviceId: "Vitest Real File Test",
      originalFilename: filename,
    };
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("content", fileBlob, filename);

    // Make the API call
    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      headers: { "X-API-Key": TEST_API_KEY },
      body: formData,
    });

    // Assertions for the POST response
    expect(
      response.status,
      `POST failed for ${filename} with status ${response.status}. Check API logs.`,
    ).toBe(201);

    const data = (await response.json()) as PhotoResponse;

    expect(
      data,
      `Response data should be defined for ${filename}`,
    ).toBeDefined();
    expect(data.id, `ID should be a string for ${filename}`).toBeTypeOf(
      "string",
    );
    expect(data.id).toMatch(/^photo-[A-Za-z0-9]{15}$/);
    expect(data.title, `Title mismatch for ${filename}`).toBe(title);
    expect(data.description, `Description mismatch for ${filename}`).toBe(
      `Uploaded file: ${filename} with tags: ${tags.join(", ")}`,
    );
    expect(data.imageUrl, `Image URL format mismatch for ${filename}`).toBe(
      `/api/photos/${data.id}/view`,
    );

    // Key Assertions for Real Files
    expect(
      data.originalFilename,
      `Original filename mismatch for ${filename}`,
    ).toBe(filename);
    expect(data.mimeType, `MIME type mismatch for ${filename}`).toBe(mimeType);
    expect(data.fileSize, `File size mismatch for ${filename}`).toBe(fileSize);

    // *** ASSERT SPECIFIC TAGS ***
    expect(
      hasSameElements(data.tags, tags),
      `Tags mismatch for ${filename}. Expected [${tags.join(", ")}], got [${data.tags.join(", ")}]`,
    ).toBe(true);

    expect(data.deviceId, `Device ID mismatch for ${filename}`).toBe(
      "Vitest Real File Test",
    );
    expect(
      data.createdAt,
      `createdAt should be a string for ${filename}`,
    ).toBeTypeOf("string");
    expect(
      data.createdAt.length,
      `createdAt format seems incorrect for ${filename}`,
    ).toBeGreaterThan(5);
    expect(
      data.updatedAt,
      `updatedAt should be a string for ${filename}`,
    ).toBeTypeOf("string");
    expect(
      data.updatedAt.length,
      `updatedAt format seems incorrect for ${filename}`,
    ).toBeGreaterThan(5);

    // Optional: Add cleanup if needed, but usually better to test GET/DELETE separately
    // await loggedFetch(`${BASE_URL}/photos/${data.id}`, { method: 'DELETE', headers: { 'X-API-Key': TEST_API_KEY } });
  });
}); // End describe block for Real File Uploads

// --- Test Suite 3: Workflow Management Endpoints ---
describe("Photo API Integration Tests (Workflow Management)", () => {
  let testPhotoId: string | null = null;
  let testPhotoData: PhotoResponse | null = null;

  beforeAll(async () => {
    // Create a test photo for workflow testing
    const dummyFileContent = "Test content for workflow tests";
    const dummyFile = new Blob([dummyFileContent], { type: "image/jpeg" });

    const formData = new FormData();
    const metadata = {
      title: `Workflow Test Photo ${Date.now()}`,
      description: "Photo for testing workflow endpoints",
      tags: ["workflow", "test"],
      deviceId: "Vitest Workflow Test",
      originalFilename: "workflow-test.jpg",
      reviewStatus: "pending",
      isPinned: false,
    };
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("content", dummyFile, "workflow-test.jpg");

    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      headers: { "X-API-Key": TEST_API_KEY },
      body: formData,
    });

    expect(response.status).toBe(201);
    testPhotoData = (await response.json()) as PhotoResponse;
    testPhotoId = testPhotoData.id;
  });

  afterAll(async () => {
    // Clean up test photo
    if (testPhotoId) {
      await loggedFetch(`${BASE_URL}/photos/${testPhotoId}`, {
        method: "DELETE",
        headers: { "X-API-Key": TEST_API_KEY },
      });
    }
  });

  it("PATCH /api/photos/:id/review - should update review status", async () => {
    expect(testPhotoId).not.toBeNull();

    // Test updating to accepted
    const reviewData = { reviewStatus: "accepted" as const };
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify(reviewData),
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoResponse;
    expect(data.reviewStatus).toBe("accepted");
    expect(data.id).toBe(testPhotoId);

    // Test updating to rejected
    const rejectData = { reviewStatus: "rejected" as const };
    const rejectResponse = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify(rejectData),
      },
    );

    expect(rejectResponse.status).toBe(200);
    const rejectResult = (await rejectResponse.json()) as PhotoResponse;
    expect(rejectResult.reviewStatus).toBe("rejected");
  });

  it("PATCH /api/photos/:id/flag - should update flag color", async () => {
    expect(testPhotoId).not.toBeNull();

    // Test setting flag color
    const flagData = { flagColor: "red" as const };
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/flag`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify(flagData),
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoResponse;
    expect(data.flagColor).toBe("red");
    expect(data.id).toBe(testPhotoId);

    // Test clearing flag color
    const clearFlagData = { flagColor: null };
    const clearResponse = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/flag`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify(clearFlagData),
      },
    );

    expect(clearResponse.status).toBe(200);
    const clearResult = (await clearResponse.json()) as PhotoResponse;
    expect(clearResult.flagColor).toBeNull();
  });

  it("PATCH /api/photos/:id/pin - should toggle pin status", async () => {
    expect(testPhotoId).not.toBeNull();

    // Test pinning photo
    const pinData = { isPinned: true };
    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/pin`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify(pinData),
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotoResponse;
    expect(data.isPinned).toBe(true);
    expect(data.id).toBe(testPhotoId);

    // Test unpinning photo
    const unpinData = { isPinned: false };
    const unpinResponse = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/pin`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify(unpinData),
      },
    );

    expect(unpinResponse.status).toBe(200);
    const unpinResult = (await unpinResponse.json()) as PhotoResponse;
    expect(unpinResult.isPinned).toBe(false);
  });

  it("should handle invalid photo ID for workflow endpoints", async () => {
    const invalidId = "invalid-photo-id";

    // Test review endpoint with invalid ID
    const reviewResponse = await loggedFetch(
      `${BASE_URL}/photos/${invalidId}/review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify({ reviewStatus: "accepted" }),
      },
    );
    expect(reviewResponse.status).toBe(404);

    // Test flag endpoint with invalid ID
    const flagResponse = await loggedFetch(
      `${BASE_URL}/photos/${invalidId}/flag`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify({ flagColor: "red" }),
      },
    );
    expect(flagResponse.status).toBe(404);

    // Test pin endpoint with invalid ID
    const pinResponse = await loggedFetch(
      `${BASE_URL}/photos/${invalidId}/pin`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": TEST_API_KEY,
        },
        body: JSON.stringify({ isPinned: true }),
      },
    );
    expect(pinResponse.status).toBe(404);
  });
}); // End describe block for Workflow Management

// --- Test Suite 4: File Serving Endpoints ---
describe("Photo API Integration Tests (File Serving)", () => {
  let testPhotoId: string | null = null;
  let testPhotoData: PhotoResponse | null = null;

  beforeAll(async () => {
    // Create a test photo for file serving testing
    const dummyFileContent = "Test image content for file serving";
    const dummyFile = new Blob([dummyFileContent], { type: "image/jpeg" });

    const formData = new FormData();
    const metadata = {
      title: `File Serving Test Photo ${Date.now()}`,
      description: "Photo for testing file serving endpoints",
      tags: ["file-serving", "test"],
      deviceId: "Vitest File Serving Test",
      originalFilename: "file-serving-test.jpg",
    };
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("content", dummyFile, "file-serving-test.jpg");

    const response = await loggedFetch(`${BASE_URL}/photos`, {
      method: "POST",
      headers: { "X-API-Key": TEST_API_KEY },
      body: formData,
    });

    expect(response.status).toBe(201);
    testPhotoData = (await response.json()) as PhotoResponse;
    testPhotoId = testPhotoData.id;
  });

  afterAll(async () => {
    // Clean up test photo
    if (testPhotoId) {
      await loggedFetch(`${BASE_URL}/photos/${testPhotoId}`, {
        method: "DELETE",
        headers: { "X-API-Key": TEST_API_KEY },
      });
    }
  });

  it("GET /api/photos/:id/view - should serve photo for viewing", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/view`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");

    const content = await response.arrayBuffer();
    expect(content.byteLength).toBeGreaterThan(0);
  });

  it("GET /api/photos/:id/thumbnail - should serve photo thumbnail", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/thumbnail`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    // Thumbnail might not be available immediately, so handle both cases
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toMatch(/^image\//);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=86400",
      );

      const content = await response.arrayBuffer();
      expect(content.byteLength).toBeGreaterThan(0);
    } else {
      // Thumbnail not available yet
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/original - should serve original photo file", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/original`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(response.headers.get("Content-Disposition")).toContain(
      "file-serving-test.jpg",
    );

    const content = await response.arrayBuffer();
    expect(content.byteLength).toBeGreaterThan(0);
  });

  it("GET /api/photos/:id/converted - should handle converted JPG file", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/converted`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    // Converted file might not be available, so handle both cases
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=3600",
      );
      expect(response.headers.get("Content-Disposition")).toContain("inline");
      expect(response.headers.get("Content-Disposition")).toContain(
        "-converted.jpg",
      );

      const content = await response.arrayBuffer();
      expect(content.byteLength).toBeGreaterThan(0);
    } else {
      // Converted file not available
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/analysis - should handle AI analysis file", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/analysis`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    // Analysis file might not be available, so handle both cases
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=3600",
      );
      expect(response.headers.get("Content-Disposition")).toContain(
        "-analysis.json",
      );

      const content = await response.text();
      expect(content.length).toBeGreaterThan(0);

      // Should be valid JSON
      const analysisData = JSON.parse(content);
      expect(analysisData).toBeTypeOf("object");
    } else {
      // Analysis not available yet
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/analysis?view=inline - should serve analysis inline", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/analysis?view=inline`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    // Analysis file might not be available, so handle both cases
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Content-Disposition")).toContain("inline");
    } else {
      // Analysis not available yet
      expect(response.status).toBe(404);
    }
  });

  it("GET /api/photos/:id/content - should handle content markdown file", async () => {
    expect(testPhotoId).not.toBeNull();

    const response = await loggedFetch(
      `${BASE_URL}/photos/${testPhotoId}/content`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    // Content file might not be available, so handle both cases
    if (response.status === 200) {
      expect(response.headers.get("Content-Type")).toBe("text/markdown");
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=3600",
      );
      expect(response.headers.get("Content-Disposition")).toContain(
        "-content.md",
      );

      const content = await response.text();
      expect(content.length).toBeGreaterThan(0);
    } else {
      // Content not available yet
      expect(response.status).toBe(404);
    }
  });

  it("should handle invalid photo ID for file serving endpoints", async () => {
    const invalidId = "invalid-photo-id";

    // Test each file serving endpoint with invalid ID
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
        {
          method: "GET",
          headers: { "X-API-Key": TEST_API_KEY },
        },
      );
      expect(response.status).toBe(404);
    }
  });

  it("should handle unauthorized access to file serving endpoints", async () => {
    expect(testPhotoId).not.toBeNull();

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
        {
          method: "GET",
          // No API key header and no authentication
        },
      );
      // Should be 401 (unauthorized) but might be 403 (forbidden) depending on implementation
      expect([401, 403]).toContain(response.status);
    }
  });
}); // End describe block for File Serving

// --- Test Suite 5: Search and Filtering ---
describe("Photo API Integration Tests (Search and Filtering)", () => {
  const searchTestPhotos: string[] = [];

  beforeAll(async () => {
    // Create multiple test photos with different metadata for search testing
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

    for (const config of photoConfigs) {
      const dummyFileContent = `Test image content for ${config.title}`;
      const dummyFile = new Blob([dummyFileContent], { type: "image/jpeg" });

      const formData = new FormData();
      const metadata = {
        title: config.title,
        description: config.description,
        tags: config.tags,
        deviceId: config.deviceId,
        originalFilename: `${config.title.toLowerCase().replace(/\s+/g, "-")}.jpg`,
      };
      formData.append("metadata", JSON.stringify(metadata));
      formData.append("content", dummyFile, metadata.originalFilename);

      const response = await loggedFetch(`${BASE_URL}/photos`, {
        method: "POST",
        headers: { "X-API-Key": TEST_API_KEY },
        body: formData,
      });

      expect(response.status).toBe(201);
      const photoData = (await response.json()) as PhotoResponse;
      searchTestPhotos.push(photoData.id);
    }
  });

  afterAll(async () => {
    // Clean up test photos
    for (const photoId of searchTestPhotos) {
      await loggedFetch(`${BASE_URL}/photos/${photoId}`, {
        method: "DELETE",
        headers: { "X-API-Key": TEST_API_KEY },
      });
    }
  });

  it("GET /api/photos?text=sunset - should accept text parameter (Note: text search not implemented yet)", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?text=sunset`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data).toHaveProperty("photos");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("limit");
    expect(data.photos).toBeInstanceOf(Array);

    // Note: Text search is not fully implemented in the backend yet
    // The API accepts the parameter but doesn't filter by text content
    expect(data.totalCount).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/photos?tags=nature - should search by single tag", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?tags=nature`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data.photos).toBeInstanceOf(Array);
    expect(data.totalCount).toBeGreaterThan(0);

    // Should find photos with nature tag
    const foundPhotos = data.photos.filter(
      (p) => searchTestPhotos.includes(p.id) && p.tags.includes("nature"),
    );
    expect(foundPhotos.length).toBeGreaterThan(0);
  });

  it("GET /api/photos?tags=nature,landscape - should search by multiple tags", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?tags=nature,landscape`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data.photos).toBeInstanceOf(Array);

    // Should find photos with both nature and landscape tags
    const foundPhotos = data.photos.filter(
      (p) =>
        searchTestPhotos.includes(p.id) &&
        p.tags.includes("nature") &&
        p.tags.includes("landscape"),
    );
    expect(foundPhotos.length).toBeGreaterThan(0);
  });

  it("GET /api/photos?limit=2 - should limit results", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?limit=2`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data.photos).toBeInstanceOf(Array);
    expect(data.photos.length).toBeLessThanOrEqual(2);
    expect(data.limit).toBe(2);
    expect(data.totalCount).toBeGreaterThan(0);
  });

  it("GET /api/photos?text=mountain&tags=nature - should accept combined parameters", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?text=mountain&tags=nature`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data.photos).toBeInstanceOf(Array);

    // Should find photos with nature tag (text search not implemented yet)
    const foundPhotos = data.photos.filter(
      (p) => searchTestPhotos.includes(p.id) && p.tags.includes("nature"),
    );
    expect(foundPhotos.length).toBeGreaterThan(0);
  });

  it("GET /api/photos?tags=nonexistenttag - should return empty results for no matches", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?tags=veryspecificnonexistenttag12345`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data.photos).toBeInstanceOf(Array);
    // Should return empty results for a non-existent tag
    expect(data.photos.length).toBe(0);
    expect(data.totalCount).toBe(0);
    expect(data.limit).toBeTypeOf("number");
  });

  it("GET /api/photos?startDate=2024-01-01&endDate=2030-12-31 - should filter by date range", async () => {
    const response = await loggedFetch(
      `${BASE_URL}/photos?startDate=2024-01-01&endDate=2030-12-31`,
      {
        method: "GET",
        headers: { "X-API-Key": TEST_API_KEY },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as PhotosListResponse;

    expect(data.photos).toBeInstanceOf(Array);
    expect(data.totalCount).toBeGreaterThan(0);

    // Should find our test photos created today
    const foundTestPhotos = data.photos.filter((p) =>
      searchTestPhotos.includes(p.id),
    );
    expect(foundTestPhotos.length).toBeGreaterThan(0);
  });

  it("should handle invalid search parameters", async () => {
    const response = await loggedFetch(`${BASE_URL}/photos?limit=invalid`, {
      method: "GET",
      headers: { "X-API-Key": TEST_API_KEY },
    });

    expect(response.status).toBe(400);
    const errorData = await response.json();
    expect(errorData).toHaveProperty("error");
  });
}); // End describe block for Search and Filtering
