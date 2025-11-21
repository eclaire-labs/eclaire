import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
	initTestDatabase,
	createTestUser,
	generateTestBookmarkId,
	DB_TEST_CONFIGS,
	type TestDatabase,
} from "./setup";

describe.each(DB_TEST_CONFIGS)(
	"$label - Type Conversions",
	({ dbType }) => {
		let testDb: TestDatabase;
		let testUserId: string;

		beforeEach(async () => {
			testDb = await initTestDatabase(dbType);
			const user = await createTestUser(testDb);
			testUserId = user.id;
		});

		afterEach(async () => {
			if (testDb) {
				await testDb.cleanup();
			}
		});

		describe("Boolean Type Conversion", () => {
			it("should store and retrieve boolean values correctly", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { db } = testDb;

				// Insert a bookmark with isPinned = true
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					isPinned: true,
				});

				// Retrieve and verify
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.isPinned).toBe(true);
				expect(typeof result.isPinned).toBe("boolean");
			});

			it("should handle boolean default value (false)", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { db } = testDb;

				// Insert without specifying isPinned
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
				});

				// Retrieve and verify default
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.isPinned).toBe(false);
			});
		});

		describe("Timestamp Type Conversion", () => {
			it("should store and retrieve timestamps as Date objects", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { db } = testDb;
				const testDate = new Date("2025-01-15T10:30:00.000Z");

				// Insert with specific createdAt
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					createdAt: testDate,
				});

				// Retrieve and verify
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.createdAt).toBeInstanceOf(Date);
				expect(result.createdAt.getTime()).toBe(testDate.getTime());
			});

			it("should handle default timestamp (now)", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { db } = testDb;
				const beforeInsert = new Date();

				// Insert without specifying createdAt
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
				});

				const afterInsert = new Date();

				// Retrieve and verify
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.createdAt).toBeInstanceOf(Date);
				expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(
					beforeInsert.getTime(),
				);
				expect(result.createdAt.getTime()).toBeLessThanOrEqual(
					afterInsert.getTime(),
				);
			});

			it("should handle nullable timestamps", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { db } = testDb;

				// Insert with dueDate = null
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					dueDate: null,
				});

				// Retrieve and verify
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.dueDate).toBeNull();
			});
		});

		describe("JSON Type Handling", () => {
			it("should store and retrieve JSON data consistently", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { db } = testDb;
				const metadata = { source: "test", nested: { key: "value" } };

				// Insert with raw metadata
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					rawMetadata: metadata,
				});

				// Retrieve and verify
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.rawMetadata).toEqual(metadata);
			});
		});
	},
);
