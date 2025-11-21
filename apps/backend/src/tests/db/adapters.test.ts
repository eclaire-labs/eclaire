import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
	initTestDatabase,
	createTestUser,
	generateTestBookmarkId,
	generateTestTaskId,
	generateTestTagId,
	DB_TEST_CONFIGS,
	type TestDatabase,
} from "./setup";
import type { Tx } from "@/ports/tx";

describe.each(DB_TEST_CONFIGS)(
	"$label - Adapter Integration Tests",
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

		describe("Repository Insert Operations", () => {
			it("should insert a single record via adapter", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
						title: "Test Bookmark",
						description: "Test Description",
					});
				});

				// Verify via direct query
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.title).toBe("Test Bookmark");
				expect(result.description).toBe("Test Description");
			});

			it("should insert multiple records in one transaction", async () => {
				const bookmark1Id = generateTestBookmarkId();
				const bookmark2Id = generateTestBookmarkId();
				const { txManager, db } = testDb;

				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmark1Id,
						userId: testUserId,
						originalUrl: "https://example1.com",
					});
					tx.bookmarks.insert({
						id: bookmark2Id,
						userId: testUserId,
						originalUrl: "https://example2.com",
					});
				});

				// Verify both were inserted
				const results = await db.query.bookmarks.findMany({
					where: eq(testDb.schema.bookmarks.userId, testUserId),
				});

				expect(results).toHaveLength(2);
				const ids = results.map((r: (typeof results)[0]) => r.id);
				expect(ids).toContain(bookmark1Id);
				expect(ids).toContain(bookmark2Id);
			});

			it("should handle insert with all data types", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;
				const dueDate = new Date("2025-12-31T23:59:59.000Z");
				const rawMetadata = { source: "test", tags: ["a", "b"] };

				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
						title: "Full Test",
						description: "All fields",
						isPinned: true,
						reviewStatus: "accepted",
						flagColor: "green",
						dueDate,
						rawMetadata,
					});
				});

				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.isPinned).toBe(true);
				expect(result.reviewStatus).toBe("accepted");
				expect(result.flagColor).toBe("green");
				expect(result.dueDate).toBeInstanceOf(Date);
				expect(result.dueDate.getTime()).toBe(dueDate.getTime());
				expect(result.rawMetadata).toEqual(rawMetadata);
			});
		});

		describe("Repository Update Operations", () => {
			it("should update a record via adapter", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert first
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
						title: "Original",
					});
				});

				// Update via adapter
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						title: "Updated",
					});
				});

				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result.title).toBe("Updated");
			});

			it("should update with complex where clause", async () => {
				const bookmark1Id = generateTestBookmarkId();
				const bookmark2Id = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert two bookmarks
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmark1Id,
						userId: testUserId,
						originalUrl: "https://example1.com",
						isPinned: false,
					});
					tx.bookmarks.insert({
						id: bookmark2Id,
						userId: testUserId,
						originalUrl: "https://example2.com",
						isPinned: true,
					});
				});

				// Update only unpinned bookmarks
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.update(
						and(
							eq(testDb.schema.bookmarks.userId, testUserId),
							eq(testDb.schema.bookmarks.isPinned, false),
						),
						{ title: "Updated Unpinned" },
					);
				});

				const results = await db.query.bookmarks.findMany({
					where: eq(testDb.schema.bookmarks.userId, testUserId),
				});

				const bookmark1 = results.find((r: (typeof results)[0]) => r.id === bookmark1Id);
				const bookmark2 = results.find((r: (typeof results)[0]) => r.id === bookmark2Id);

				expect(bookmark1.title).toBe("Updated Unpinned");
				expect(bookmark2.title).toBeNull(); // Not updated
			});

			it("should update multiple fields at once", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert first
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
						title: "Original",
						isPinned: false,
						reviewStatus: null,
					});
				});

				// Update multiple fields
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						title: "Multi-Update",
						isPinned: true,
						reviewStatus: "accepted",
					});
				});

				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result.title).toBe("Multi-Update");
				expect(result.isPinned).toBe(true);
				expect(result.reviewStatus).toBe("accepted");
			});
		});

		describe("Repository Delete Operations", () => {
			it("should delete a record via adapter", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert first
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
					});
				});

				// Delete via adapter
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.delete(eq(testDb.schema.bookmarks.id, bookmarkId));
				});

				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeUndefined();
			});

			it("should delete with complex where clause", async () => {
				const bookmark1Id = generateTestBookmarkId();
				const bookmark2Id = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert two bookmarks
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.insert({
						id: bookmark1Id,
						userId: testUserId,
						originalUrl: "https://example1.com",
						reviewStatus: "rejected",
					});
					tx.bookmarks.insert({
						id: bookmark2Id,
						userId: testUserId,
						originalUrl: "https://example2.com",
						reviewStatus: "accepted",
					});
				});

				// Delete only rejected bookmarks
				await txManager.withTransaction((tx: Tx) => {
					tx.bookmarks.delete(
						and(
							eq(testDb.schema.bookmarks.userId, testUserId),
							eq(testDb.schema.bookmarks.reviewStatus, "rejected"),
						),
					);
				});

				const results = await db.query.bookmarks.findMany({
					where: eq(testDb.schema.bookmarks.userId, testUserId),
				});

				expect(results).toHaveLength(1);
				expect(results[0].id).toBe(bookmark2Id);
			});
		});

		describe("Error Handling", () => {
			it("should handle constraint violation on insert", async () => {
				const { txManager } = testDb;

				await expect(
					txManager.withTransaction((tx: Tx) => {
						// Missing required field (url)
						tx.bookmarks.insert({
							id: generateTestBookmarkId(),
							userId: testUserId,
							url: null as any, // Violates NOT NULL
						});
					}),
				).rejects.toThrow();
			});

			it("should handle foreign key violation", async () => {
				const { txManager } = testDb;

				await expect(
					txManager.withTransaction((tx: Tx) => {
						tx.bookmarks.insert({
							id: generateTestBookmarkId(),
							userId: "nonexistent-user",
							originalUrl: "https://example.com",
						});
					}),
				).rejects.toThrow();
			});

			it("should rollback all operations on error", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				await expect(
					txManager.withTransaction((tx: Tx) => {
						// First operation should succeed
						tx.bookmarks.insert({
							id: bookmarkId,
							userId: testUserId,
							originalUrl: "https://example.com",
						});

						// Second operation will fail
						tx.bookmarks.insert({
							id: generateTestBookmarkId(),
							userId: "nonexistent-user",
							originalUrl: "https://example.com",
						});
					}),
				).rejects.toThrow();

				// Verify first operation was rolled back
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeUndefined();
			});
		});

		describe("Complex Multi-Table Operations", () => {
			it("should handle task creation with tags pattern", async () => {
				const taskId = generateTestTaskId();
				const tag1Id = generateTestTagId();
				const tag2Id = generateTestTagId();
				const { txManager, db } = testDb;

				// Create tags first
				await txManager.withTransaction((tx: Tx) => {
					tx.tags.insert({ id: tag1Id, userId: testUserId, name: "urgent" });
					tx.tags.insert({ id: tag2Id, userId: testUserId, name: "work" });
				});

				// Create task with tags in transaction
				await txManager.withTransaction((tx: Tx) => {
					tx.tasks.insert({
						id: taskId,
						userId: testUserId,
						title: "Important Task",
						status: "pending",
					});

					tx.tasksTags.insert({ taskId, tagId: tag1Id });
					tx.tasksTags.insert({ taskId, tagId: tag2Id });
				});

				// Verify task exists
				const task = await db.query.tasks.findFirst({
					where: eq(testDb.schema.tasks.id, taskId),
				});
				expect(task).toBeDefined();

				// Verify tag relationships
				const taskTags = await db.query.tasksTags.findMany({
					where: eq(testDb.schema.tasksTags.taskId, taskId),
				});
				expect(taskTags).toHaveLength(2);
			});
		});
	},
);
