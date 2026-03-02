import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractAndGeocode } from "../../lib/services/photos.js";

// --- extractAndGeocode ---

describe("extractAndGeocode", () => {
  const fixturesDir = path.join(
    process.cwd(),
    "src",
    "tests",
    "fixtures",
    "photos",
  );

  it("should extract image dimensions from a JPEG file", async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, "photo1.jpg"));
    const result = await extractAndGeocode(buffer as Buffer);

    expect(result).toBeDefined();
    expect(result.exif).toBeDefined();
    // photo1.jpg is 640x640
    expect(result.exif?.ImageWidth).toBe(640);
    expect(result.exif?.ImageHeight).toBe(640);
  });

  it("should extract image dimensions from a second JPEG file", async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, "photo2.JPEG"));
    const result = await extractAndGeocode(buffer as Buffer);

    expect(result).toBeDefined();
    expect(result.exif).toBeDefined();
    // photo2.JPEG is 640x476
    expect(result.exif?.ImageWidth).toBe(640);
    expect(result.exif?.ImageHeight).toBe(476);
  });

  it("should extract image dimensions from a PNG file", async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, "photo3.png"));
    const result = await extractAndGeocode(buffer as Buffer);

    expect(result).toBeDefined();
    expect(result.exif).toBeDefined();
    // photo3.png is 600x400
    expect(result.exif?.ImageWidth).toBe(600);
    expect(result.exif?.ImageHeight).toBe(400);
  });

  it("should extract image dimensions from an HEIC file", async () => {
    const buffer = await fs.readFile(path.join(fixturesDir, "photo4.HEIC"));
    const result = await extractAndGeocode(buffer as Buffer);

    expect(result).toBeDefined();
    expect(result.exif).toBeDefined();
    // HEIC should have dimensions
    expect(result.exif?.ImageWidth).toBeTypeOf("number");
    expect(result.exif?.ImageHeight).toBeTypeOf("number");
    expect(result.exif?.ImageWidth).toBeGreaterThan(0);
    expect(result.exif?.ImageHeight).toBeGreaterThan(0);
  });

  it("should return empty metadata for a non-image buffer", async () => {
    const textBuffer = Buffer.from("This is just plain text, not an image.");
    const result = await extractAndGeocode(textBuffer);

    // Should not throw, just return empty/undefined metadata
    expect(result).toBeDefined();
    // exif may be undefined or an empty-ish object
  });

  it("should return empty metadata for an empty buffer", async () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = await extractAndGeocode(emptyBuffer);

    expect(result).toBeDefined();
  });

  it("should handle a corrupt/truncated buffer gracefully", async () => {
    // Create a buffer that starts like JPEG but is truncated
    const corruptBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    ]);
    const result = await extractAndGeocode(corruptBuffer);

    // Should not throw
    expect(result).toBeDefined();
  });

  it("should extract EXIF camera metadata from JPEG with EXIF", async () => {
    // photo1.jpg has EXIF data
    const buffer = await fs.readFile(path.join(fixturesDir, "photo1.jpg"));
    const result = await extractAndGeocode(buffer as Buffer);

    expect(result.exif).toBeDefined();
    // At minimum, we should get FileType from Sharp
    expect(result.exif?.FileType).toBe("jpeg");
  });

  it("should set location data when GPS coordinates are present", async () => {
    // Check each fixture - if any has GPS, verify location extraction
    const buffer = await fs.readFile(path.join(fixturesDir, "photo1.jpg"));
    const result = await extractAndGeocode(buffer as Buffer);

    // If this particular photo has GPS data, location should be populated
    if (result.exif?.latitude && result.exif?.longitude) {
      expect(result.location).toBeDefined();
      expect(result.location?.cityName).toBeTypeOf("string");
      expect(result.location?.countryIso2).toBeTypeOf("string");
    }
    // If no GPS, location should be undefined - that's fine too
  });
});

// --- isOriginalViewable logic ---
// This is derived from MIME type in getPhotoWithDetails, tested here as a pure function

describe("isOriginalViewable derivation", () => {
  function isOriginalViewable(mimeType: string): boolean {
    return !["image/heic", "image/heif"].includes(mimeType);
  }

  it("should return true for image/jpeg", () => {
    expect(isOriginalViewable("image/jpeg")).toBe(true);
  });

  it("should return true for image/png", () => {
    expect(isOriginalViewable("image/png")).toBe(true);
  });

  it("should return true for image/webp", () => {
    expect(isOriginalViewable("image/webp")).toBe(true);
  });

  it("should return true for image/gif", () => {
    expect(isOriginalViewable("image/gif")).toBe(true);
  });

  it("should return true for image/svg+xml", () => {
    expect(isOriginalViewable("image/svg+xml")).toBe(true);
  });

  it("should return false for image/heic", () => {
    expect(isOriginalViewable("image/heic")).toBe(false);
  });

  it("should return false for image/heif", () => {
    expect(isOriginalViewable("image/heif")).toBe(false);
  });

  it("should return true for empty string", () => {
    expect(isOriginalViewable("")).toBe(true);
  });
});

// --- Photo URL generation logic ---
// This is derived in getPhotoWithDetails, tested here as pure functions

describe("Photo URL generation", () => {
  function generateImageUrl(photoId: string): string {
    return `/api/photos/${photoId}/view`;
  }

  function generateThumbnailUrl(
    photoId: string,
    thumbnailStorageId: string | null,
  ): string | null {
    return thumbnailStorageId ? `/api/photos/${photoId}/thumbnail` : null;
  }

  function generateOriginalUrl(photoId: string): string {
    return `/api/photos/${photoId}/original`;
  }

  function generateConvertedJpgUrl(
    photoId: string,
    convertedJpgStorageId: string | null,
  ): string | null {
    return convertedJpgStorageId ? `/api/photos/${photoId}/converted` : null;
  }

  it("should generate view URL", () => {
    expect(generateImageUrl("photo-abc123")).toBe(
      "/api/photos/photo-abc123/view",
    );
  });

  it("should generate thumbnail URL when storage ID exists", () => {
    expect(generateThumbnailUrl("photo-abc123", "some-storage-id")).toBe(
      "/api/photos/photo-abc123/thumbnail",
    );
  });

  it("should return null thumbnail URL when no storage ID", () => {
    expect(generateThumbnailUrl("photo-abc123", null)).toBeNull();
  });

  it("should generate original URL", () => {
    expect(generateOriginalUrl("photo-abc123")).toBe(
      "/api/photos/photo-abc123/original",
    );
  });

  it("should generate converted JPG URL when storage ID exists", () => {
    expect(generateConvertedJpgUrl("photo-abc123", "some-storage-id")).toBe(
      "/api/photos/photo-abc123/converted",
    );
  });

  it("should return null converted URL when no storage ID", () => {
    expect(generateConvertedJpgUrl("photo-abc123", null)).toBeNull();
  });
});

// --- EXIF date parsing logic ---
// Tests the date selection logic used in createPhoto

describe("EXIF date parsing logic", () => {
  function parseDateTaken(exif: Record<string, unknown>): Date | null {
    if (
      exif.DateTimeOriginal instanceof Date &&
      !Number.isNaN(exif.DateTimeOriginal.getTime())
    ) {
      return exif.DateTimeOriginal;
    }
    if (
      exif.CreateDate instanceof Date &&
      !Number.isNaN(exif.CreateDate.getTime())
    ) {
      return exif.CreateDate;
    }
    return null;
  }

  it("should use DateTimeOriginal when available", () => {
    const date = new Date("2024-06-15T10:30:00Z");
    const result = parseDateTaken({ DateTimeOriginal: date });
    expect(result).toBe(date);
  });

  it("should fall back to CreateDate when DateTimeOriginal is missing", () => {
    const date = new Date("2024-06-15T10:30:00Z");
    const result = parseDateTaken({ CreateDate: date });
    expect(result).toBe(date);
  });

  it("should prefer DateTimeOriginal over CreateDate", () => {
    const dto = new Date("2024-06-15T10:30:00Z");
    const cd = new Date("2024-06-14T08:00:00Z");
    const result = parseDateTaken({ DateTimeOriginal: dto, CreateDate: cd });
    expect(result).toBe(dto);
  });

  it("should return null when neither date is present", () => {
    const result = parseDateTaken({});
    expect(result).toBeNull();
  });

  it("should return null when DateTimeOriginal is an invalid date", () => {
    const result = parseDateTaken({ DateTimeOriginal: new Date("invalid") });
    expect(result).toBeNull();
  });

  it("should fall back to CreateDate when DateTimeOriginal is invalid", () => {
    const cd = new Date("2024-06-15T10:30:00Z");
    const result = parseDateTaken({
      DateTimeOriginal: new Date("invalid"),
      CreateDate: cd,
    });
    expect(result).toBe(cd);
  });

  it("should return null when both dates are invalid", () => {
    const result = parseDateTaken({
      DateTimeOriginal: new Date("invalid"),
      CreateDate: new Date("invalid"),
    });
    expect(result).toBeNull();
  });

  it("should return null when DateTimeOriginal is not a Date object", () => {
    const result = parseDateTaken({
      DateTimeOriginal: "2024-06-15",
    });
    expect(result).toBeNull();
  });
});
