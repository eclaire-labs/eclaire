// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock apiFetch and normalizeApiUrl
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  normalizeApiUrl: vi.fn((url: string) => `http://api${url}`),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { apiFetch, normalizeApiUrl } from "@/lib/api-client";
import {
  transformPhotoData,
  usePhoto,
  usePhotos,
} from "@/hooks/use-photos";

const mockApiFetch = vi.mocked(apiFetch);
const mockNormalizeApiUrl = vi.mocked(normalizeApiUrl);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function mockJsonResponse(data: unknown) {
  return {
    json: () => Promise.resolve(data),
    ok: true,
    status: 200,
  } as unknown as Response;
}

/** A complete raw photo object for use in tests. */
function makeRawPhoto(overrides: Record<string, unknown> = {}) {
  return {
    id: "photo-1",
    title: "Sunset",
    description: "A beautiful sunset",
    originalFilename: "IMG_1234.jpg",
    deviceId: "iphone-14",
    mimeType: "image/jpeg",
    fileSize: 4096000,
    tags: ["nature", "sunset"],
    imageUrl: "/api/photos/photo-1/image",
    thumbnailUrl: "/api/photos/photo-1/thumbnail",
    imageWidth: 4032,
    imageHeight: 3024,
    dateTaken: "2026-01-15T18:30:00Z",
    cameraMake: "Apple",
    cameraModel: "iPhone 14 Pro",
    lensModel: "iPhone 14 Pro back triple camera 6.86mm f/1.78",
    fNumber: 1.78,
    exposureTime: "1/1000",
    iso: 100,
    orientation: 1,
    latitude: 48.8566,
    longitude: 2.3522,
    altitude: 35.0,
    locationCity: "Paris",
    locationCountryIso2: "FR",
    locationCountryName: "France",
    photoType: "landscape",
    ocrText: "No text",
    dominantColors: ["#ff6600", "#003366"],
    processingStatus: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    dueDate: "2026-04-01",
    originalUrl: "/api/photos/photo-1/original",
    convertedJpgUrl: "/api/photos/photo-1/converted",
    isOriginalViewable: true,
    reviewStatus: "approved",
    flagColor: "green",
    isPinned: true,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// transformPhotoData
// ---------------------------------------------------------------------------

describe("transformPhotoData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults imageUrl to empty string (not null) when falsy", () => {
    const result = transformPhotoData(makeRawPhoto({ imageUrl: null }));
    expect(result.imageUrl).toBe("");

    const result2 = transformPhotoData(makeRawPhoto({ imageUrl: undefined }));
    expect(result2.imageUrl).toBe("");

    const result3 = transformPhotoData(makeRawPhoto({ imageUrl: "" }));
    expect(result3.imageUrl).toBe("");
  });

  it("defaults originalUrl to empty string (not null) when falsy", () => {
    const result = transformPhotoData(makeRawPhoto({ originalUrl: null }));
    expect(result.originalUrl).toBe("");

    const result2 = transformPhotoData(
      makeRawPhoto({ originalUrl: undefined }),
    );
    expect(result2.originalUrl).toBe("");
  });

  it("applies normalizeApiUrl to truthy thumbnailUrl and convertedJpgUrl, null when falsy", () => {
    // Truthy values
    const rawTruthy = makeRawPhoto();
    const resultTruthy = transformPhotoData(rawTruthy);

    expect(mockNormalizeApiUrl).toHaveBeenCalledWith(
      rawTruthy.thumbnailUrl,
    );
    expect(resultTruthy.thumbnailUrl).toBe(
      `http://api${rawTruthy.thumbnailUrl as string}`,
    );

    expect(mockNormalizeApiUrl).toHaveBeenCalledWith(
      rawTruthy.convertedJpgUrl,
    );
    expect(resultTruthy.convertedJpgUrl).toBe(
      `http://api${rawTruthy.convertedJpgUrl as string}`,
    );

    vi.clearAllMocks();

    // Falsy values
    const rawFalsy = makeRawPhoto({
      thumbnailUrl: null,
      convertedJpgUrl: null,
    });
    const resultFalsy = transformPhotoData(rawFalsy);

    expect(resultFalsy.thumbnailUrl).toBeNull();
    expect(resultFalsy.convertedJpgUrl).toBeNull();

    // normalizeApiUrl should still have been called for imageUrl and originalUrl (truthy in base),
    // but NOT for thumbnailUrl or convertedJpgUrl
    const calls = mockNormalizeApiUrl.mock.calls.flat();
    expect(calls).not.toContain(null);
  });

  it("passes through EXIF fields unchanged", () => {
    const raw = makeRawPhoto();
    const result = transformPhotoData(raw);

    expect(result.cameraMake).toBe(raw.cameraMake);
    expect(result.cameraModel).toBe(raw.cameraModel);
    expect(result.lensModel).toBe(raw.lensModel);
    expect(result.fNumber).toBe(raw.fNumber);
    expect(result.exposureTime).toBe(raw.exposureTime);
    expect(result.iso).toBe(raw.iso);
    expect(result.orientation).toBe(raw.orientation);
    expect(result.latitude).toBe(raw.latitude);
    expect(result.longitude).toBe(raw.longitude);
    expect(result.altitude).toBe(raw.altitude);
    expect(result.locationCity).toBe(raw.locationCity);
    expect(result.locationCountryIso2).toBe(raw.locationCountryIso2);
    expect(result.locationCountryName).toBe(raw.locationCountryName);
    expect(result.imageWidth).toBe(raw.imageWidth);
    expect(result.imageHeight).toBe(raw.imageHeight);
    expect(result.dateTaken).toBe(raw.dateTaken);
  });

  it("defaults photoType, ocrText, and dominantColors to null when missing", () => {
    const result = transformPhotoData(
      makeRawPhoto({
        photoType: undefined,
        ocrText: undefined,
        dominantColors: undefined,
      }),
    );

    expect(result.photoType).toBeNull();
    expect(result.ocrText).toBeNull();
    expect(result.dominantColors).toBeNull();
  });

  it("defaults dueDate to null when missing", () => {
    const result = transformPhotoData(makeRawPhoto({ dueDate: undefined }));
    expect(result.dueDate).toBeNull();

    const result2 = transformPhotoData(makeRawPhoto({ dueDate: null }));
    expect(result2.dueDate).toBeNull();
  });

  it("defaults tags to [] and preserves enabled: false via ??", () => {
    // Tags
    expect(
      transformPhotoData(makeRawPhoto({ tags: null })).tags,
    ).toEqual([]);
    expect(
      transformPhotoData(makeRawPhoto({ tags: undefined })).tags,
    ).toEqual([]);

    // enabled: false preserved
    const result = transformPhotoData(makeRawPhoto({ enabled: false }));
    expect(result.enabled).toBe(false);

    // enabled: undefined defaults to true
    const result2 = transformPhotoData(makeRawPhoto({ enabled: undefined }));
    expect(result2.enabled).toBe(true);
  });

  it("defaults reviewStatus, flagColor, isPinned, processingStatus, and generates date fallbacks", () => {
    const before = new Date().toISOString();
    const result = transformPhotoData(
      makeRawPhoto({
        reviewStatus: undefined,
        flagColor: undefined,
        isPinned: undefined,
        processingStatus: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      }),
    );
    const after = new Date().toISOString();

    expect(result.reviewStatus).toBe("pending");
    expect(result.flagColor).toBeNull();
    expect(result.isPinned).toBe(false);
    expect(result.processingStatus).toBeNull();

    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
    expect(result.updatedAt >= before).toBe(true);
    expect(result.updatedAt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// usePhotos hook — mutation tests
// ---------------------------------------------------------------------------

describe("usePhotos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createPhoto sends POST with FormData (not JSON stringified)", async () => {
    // Initial list fetch
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

    const { result } = renderHook(() => usePhotos(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const formData = new FormData();
    formData.append("file", new Blob(["image-content"]), "photo.jpg");
    formData.append("title", "Sunset");

    // Create mutation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse(makeRawPhoto({ id: "photo-new" })),
    );
    // Refetch after cache invalidation
    mockApiFetch.mockResolvedValueOnce(
      mockJsonResponse({ items: [makeRawPhoto({ id: "photo-new" })] }),
    );

    await result.current.createPhoto(formData);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/photos", {
      method: "POST",
      body: formData,
    });
  });
});

// ---------------------------------------------------------------------------
// usePhoto hook — single item
// ---------------------------------------------------------------------------

describe("usePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { photo, ... } fetched via useSingle", async () => {
    const raw = makeRawPhoto({ id: "photo-42" });
    mockApiFetch.mockResolvedValueOnce(mockJsonResponse(raw));

    const { result } = renderHook(() => usePhoto("photo-42"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/photos/photo-42");
    expect(result.current.photo).toBeDefined();
    expect(result.current.photo?.id).toBe("photo-42");
    expect(result.current.photo?.title).toBe(raw.title);
  });
});
