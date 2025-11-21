import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
	initTestDatabase,
	cleanDatabase,
	createTestUser,
	generateTestBookmarkId,
	generateTestTaskId,
	generateTestTagId,
	DB_TEST_CONFIGS,
	type TestDatabase,
} from "./setup";

describe.each(DB_TEST_CONFIGS)(
	"$label - Transaction Tests",
	({ dbType, label }) => {
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

		describe("Basic Transaction Operations", () => {
			it("should insert a record within a transaction", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert within transaction
				await txManager.withTransaction((tx) => {
					tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
						title: "Test Bookmark",
					});
				});

				// Verify the insert persisted
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.id).toBe(bookmarkId);
				expect(result.originalUrl).toBe("https://example.com");
			});

			it("should update a record within a transaction", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// First insert
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					title: "Original Title",
				});

				// Update within transaction
				await txManager.withTransaction((tx) => {
					tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						title: "Updated Title",
					});
				});

				// Verify the update persisted
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.title).toBe("Updated Title");
			});

			it("should delete a record within a transaction", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// First insert
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
				});

				// Delete within transaction
				await txManager.withTransaction((tx) => {
					tx.bookmarks.delete(eq(testDb.schema.bookmarks.id, bookmarkId));
				});

				// Verify the delete persisted
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeUndefined();
			});
		});

		describe("Multi-Table Transactions", () => {
			it("should insert into multiple tables atomically", async () => {
				const taskId = generateTestTaskId();
				const tagId1 = generateTestTagId();
				const tagId2 = generateTestTagId();
				const { txManager, db } = testDb;

				// First create tags
				await db.insert(testDb.schema.tags).values([
					{ id: tagId1, userId: testUserId, name: "tag1" },
					{ id: tagId2, userId: testUserId, name: "tag2" },
				]);

				// Insert task and task-tag relationships in transaction
				await txManager.withTransaction((tx) => {
					// Insert task
					tx.tasks.insert({
						id: taskId,
						userId: testUserId,
						title: "Test Task",
						status: "pending",
					});

					// Insert task-tag relationships
					tx.tasksTags.insert({ taskId, tagId: tagId1 });
					tx.tasksTags.insert({ taskId, tagId: tagId2 });
				});

				// Verify task exists
				const task = await db.query.tasks.findFirst({
					where: eq(testDb.schema.tasks.id, taskId),
				});
				expect(task).toBeDefined();

				// Verify both task-tag relationships exist
				const taskTags = await db.query.tasksTags.findMany({
					where: eq(testDb.schema.tasksTags.taskId, taskId),
				});
				expect(taskTags).toHaveLength(2);
			});
		});

		describe("Transaction Rollback", () => {
			it("should rollback on error", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Attempt transaction that will fail
				await expect(
					txManager.withTransaction((tx) => {
						tx.bookmarks.insert({
							id: bookmarkId,
							userId: testUserId,
							originalUrl: "https://example.com",
						});

						// Throw error to trigger rollback
						throw new Error("Transaction failed");
					}),
				).rejects.toThrow("Transaction failed");

				// Verify nothing was inserted
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeUndefined();
			});

			it("should rollback all operations on error in multi-table transaction", async () => {
				const taskId = generateTestTaskId();
				const tagId = generateTestTagId();
				const { txManager, db } = testDb;

				// First create tag
				await db.insert(testDb.schema.tags).values({
					id: tagId,
					userId: testUserId,
					name: "test-tag",
				});

				// Attempt transaction that will fail
				await expect(
					txManager.withTransaction((tx) => {
						// Insert task
						tx.tasks.insert({
							id: taskId,
							userId: testUserId,
							title: "Test Task",
							status: "pending",
						});

						// Insert task-tag relationship
						tx.tasksTags.insert({ taskId, tagId });

						// Throw error to trigger rollback
						throw new Error("Multi-table transaction failed");
					}),
				).rejects.toThrow("Multi-table transaction failed");

				// Verify task was not inserted
				const task = await db.query.tasks.findFirst({
					where: eq(testDb.schema.tasks.id, taskId),
				});
				expect(task).toBeUndefined();

				// Verify task-tag relationship was not inserted
				const taskTags = await db.query.tasksTags.findMany({
					where: eq(testDb.schema.tasksTags.taskId, taskId),
				});
				expect(taskTags).toHaveLength(0);
			});
		});

		describe("Transaction Adapter Behavior", () => {
			if (dbType === "sqlite") {
				it("should throw error if transaction callback is async (SQLite)", async () => {
					const { txManager } = testDb;

					// SQLite should reject async callbacks
					await expect(
						txManager.withTransaction(async (tx) => {
							// This should trigger an error
							await Promise.resolve();
							tx.bookmarks.insert({
								id: generateTestBookmarkId(),
								userId: testUserId,
								originalUrl: "https://example.com",
							});
						}),
					).rejects.toThrow(/synchronous/i);
				});
			}

			if (dbType === "pglite") {
				it("should support deferred execution (PGlite)", async () => {
					const bookmarkId = generateTestBookmarkId();
					const { txManager, db } = testDb;

					// PGlite queues operations and executes them after callback
					await txManager.withTransaction((tx) => {
						// Operation is queued
						tx.bookmarks.insert({
							id: bookmarkId,
							userId: testUserId,
							originalUrl: "https://example.com",
						});
						// Callback returns immediately, operations execute after
					});

					// Verify operation was executed
					const result = await db.query.bookmarks.findFirst({
						where: eq(testDb.schema.bookmarks.id, bookmarkId),
					});

					expect(result).toBeDefined();
					expect(result.id).toBe(bookmarkId);
				});
			}

			it("should return value from transaction callback", async () => {
				const { txManager } = testDb;

				const result = await txManager.withTransaction((tx) => {
					return { success: true, value: 42 };
				});

				expect(result).toEqual({ success: true, value: 42 });
			});
		});

		describe("Transaction with Complex Operations", () => {
			it("should handle multiple updates to the same record", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// First insert
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					title: "Original",
					isPinned: false,
				});

				// Multiple updates in one transaction
				await txManager.withTransaction((tx) => {
					tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						title: "First Update",
					});
					tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						isPinned: true,
					});
					tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						title: "Final Update",
					});
				});

				// Verify final state
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.title).toBe("Final Update");
				expect(result.isPinned).toBe(true);
			});
		});
	},
);
