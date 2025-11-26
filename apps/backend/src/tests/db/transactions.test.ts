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
				await txManager.withTransaction(async (tx) => {
					await tx.bookmarks.insert({
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
				await txManager.withTransaction(async (tx) => {
					await tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
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
				await txManager.withTransaction(async (tx) => {
					await tx.bookmarks.delete(eq(testDb.schema.bookmarks.id, bookmarkId));
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
				await txManager.withTransaction(async (tx) => {
					// Insert task
					await tx.tasks.insert({
						id: taskId,
						userId: testUserId,
						title: "Test Task",
						status: "pending",
					});

					// Insert task-tag relationships
					await tx.tasksTags.insert({ taskId, tagId: tagId1 });
					await tx.tasksTags.insert({ taskId, tagId: tagId2 });
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
					txManager.withTransaction(async (tx) => {
						await tx.bookmarks.insert({
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
					txManager.withTransaction(async (tx) => {
						// Insert task
						await tx.tasks.insert({
							id: taskId,
							userId: testUserId,
							title: "Test Task",
							status: "pending",
						});

						// Insert task-tag relationship
						await tx.tasksTags.insert({ taskId, tagId });

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

		describe("Read-Modify-Write Patterns", () => {
			it("should support reading inside a transaction (findFirst)", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// First insert
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					title: "Original Title",
				});

				// Read-Modify-Write inside transaction
				await txManager.withTransaction(async (tx) => {
					// Read inside transaction
					const existing = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);

					expect(existing).toBeDefined();
					expect(existing?.title).toBe("Original Title");

					// Modify based on read
					if (existing) {
						await tx.bookmarks.update(
							eq(testDb.schema.bookmarks.id, bookmarkId),
							{ title: `${existing.title} - Updated` },
						);
					}
				});

				// Verify the update persisted
				const result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(result).toBeDefined();
				expect(result.title).toBe("Original Title - Updated");
			});

			it("should support upsert pattern (insert if not exists)", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Upsert pattern - first time should insert
				await txManager.withTransaction(async (tx) => {
					const existing = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);

					if (!existing) {
						await tx.bookmarks.insert({
							id: bookmarkId,
							userId: testUserId,
							originalUrl: "https://example.com",
							title: "Created via upsert",
						});
					} else {
						await tx.bookmarks.update(
							eq(testDb.schema.bookmarks.id, bookmarkId),
							{ title: "Updated via upsert" },
						);
					}
				});

				// Verify insert happened
				let result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});
				expect(result).toBeDefined();
				expect(result.title).toBe("Created via upsert");

				// Upsert pattern - second time should update
				await txManager.withTransaction(async (tx) => {
					const existing = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);

					if (!existing) {
						await tx.bookmarks.insert({
							id: bookmarkId,
							userId: testUserId,
							originalUrl: "https://example.com",
							title: "Created via upsert",
						});
					} else {
						await tx.bookmarks.update(
							eq(testDb.schema.bookmarks.id, bookmarkId),
							{ title: "Updated via upsert" },
						);
					}
				});

				// Verify update happened
				result = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});
				expect(result).toBeDefined();
				expect(result.title).toBe("Updated via upsert");
			});

			it("should support reading multiple records inside a transaction (findMany)", async () => {
				const bookmarkId1 = generateTestBookmarkId();
				const bookmarkId2 = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Insert multiple bookmarks
				await db.insert(testDb.schema.bookmarks).values([
					{
						id: bookmarkId1,
						userId: testUserId,
						originalUrl: "https://example1.com",
						title: "Bookmark 1",
					},
					{
						id: bookmarkId2,
						userId: testUserId,
						originalUrl: "https://example2.com",
						title: "Bookmark 2",
					},
				]);

				// Read multiple records inside transaction
				let readCount = 0;
				await txManager.withTransaction(async (tx) => {
					const bookmarks = await tx.bookmarks.findMany(
						eq(testDb.schema.bookmarks.userId, testUserId),
					);

					readCount = bookmarks.length;

					// Update all bookmarks
					for (const bookmark of bookmarks) {
						await tx.bookmarks.update(
							eq(testDb.schema.bookmarks.id, bookmark.id),
							{ title: `${bookmark.title} - Updated` },
						);
					}
				});

				expect(readCount).toBe(2);

				// Verify all updates persisted
				const result1 = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId1),
				});
				const result2 = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId2),
				});

				expect(result1?.title).toBe("Bookmark 1 - Updated");
				expect(result2?.title).toBe("Bookmark 2 - Updated");
			});
		});

		describe("Transaction Return Values", () => {
			it("should return value from transaction callback", async () => {
				const { txManager } = testDb;

				const result = await txManager.withTransaction(async (tx) => {
					return { success: true, value: 42 };
				});

				expect(result).toEqual({ success: true, value: 42 });
			});

			it("should return read data from transaction", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// First insert
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					title: "Test Bookmark",
				});

				// Read and return from transaction
				const result = await txManager.withTransaction(async (tx) => {
					const bookmark = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);
					return bookmark;
				});

				expect(result).toBeDefined();
				expect(result?.id).toBe(bookmarkId);
				expect(result?.title).toBe("Test Bookmark");
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
				await txManager.withTransaction(async (tx) => {
					await tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						title: "First Update",
					});
					await tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
						isPinned: true,
					});
					await tx.bookmarks.update(eq(testDb.schema.bookmarks.id, bookmarkId), {
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

		describe("Transaction Consistency", () => {
			it("should see writes immediately within the same transaction", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager } = testDb;

				await txManager.withTransaction(async (tx) => {
					// Write
					await tx.bookmarks.insert({
						id: bookmarkId,
						userId: testUserId,
						originalUrl: "https://example.com",
						title: "Initial Title",
					});

					// Read back immediately - should see the write
					const inserted = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);

					expect(inserted).toBeDefined();
					expect(inserted?.title).toBe("Initial Title");

					// Update
					await tx.bookmarks.update(
						eq(testDb.schema.bookmarks.id, bookmarkId),
						{ title: "Updated Title" },
					);

					// Read back again - should see the update
					const updated = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);

					expect(updated).toBeDefined();
					expect(updated?.title).toBe("Updated Title");
				});
			});

			it("should handle interleaved read-write operations correctly", async () => {
				const id1 = generateTestBookmarkId();
				const id2 = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Pre-populate one record
				await db.insert(testDb.schema.bookmarks).values({
					id: id1,
					userId: testUserId,
					originalUrl: "https://example1.com",
					title: "Existing",
				});

				await txManager.withTransaction(async (tx) => {
					// Read existing
					const existing = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, id1),
					);
					expect(existing?.title).toBe("Existing");

					// Insert new
					await tx.bookmarks.insert({
						id: id2,
						userId: testUserId,
						originalUrl: "https://example2.com",
						title: "New",
					});

					// Read the new one
					const newRecord = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, id2),
					);
					expect(newRecord?.title).toBe("New");

					// Update existing based on new
					await tx.bookmarks.update(
						eq(testDb.schema.bookmarks.id, id1),
						{ title: `${existing?.title} + ${newRecord?.title}` },
					);

					// Read existing again
					const updated = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, id1),
					);
					expect(updated?.title).toBe("Existing + New");
				});
			});

			it("should handle concurrent transactions correctly", async () => {
				const { txManager, db } = testDb;
				const bookmarkId = generateTestBookmarkId();

				// Insert initial record
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					title: "counter:0",
				});

				// Run 5 concurrent transactions that each increment a counter
				const incrementTx = async () => {
					await txManager.withTransaction(async (tx) => {
						const current = await tx.bookmarks.findFirst(
							eq(testDb.schema.bookmarks.id, bookmarkId),
						);
						const count = parseInt(current?.title?.split(":")[1] || "0", 10);
						await tx.bookmarks.update(
							eq(testDb.schema.bookmarks.id, bookmarkId),
							{ title: `counter:${count + 1}` },
						);
					});
				};

				// Launch concurrently
				await Promise.all([
					incrementTx(),
					incrementTx(),
					incrementTx(),
					incrementTx(),
					incrementTx(),
				]);

				// Verify final count is 5 (all transactions applied)
				const final = await db.query.bookmarks.findFirst({
					where: eq(testDb.schema.bookmarks.id, bookmarkId),
				});

				expect(final?.title).toBe("counter:5");
			});

			it("should not find deleted records within the same transaction", async () => {
				const bookmarkId = generateTestBookmarkId();
				const { txManager, db } = testDb;

				// Pre-insert
				await db.insert(testDb.schema.bookmarks).values({
					id: bookmarkId,
					userId: testUserId,
					originalUrl: "https://example.com",
					title: "To Delete",
				});

				await txManager.withTransaction(async (tx) => {
					// Verify it exists
					const before = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);
					expect(before).toBeDefined();

					// Delete it
					await tx.bookmarks.delete(eq(testDb.schema.bookmarks.id, bookmarkId));

					// Should not find it anymore
					const after = await tx.bookmarks.findFirst(
						eq(testDb.schema.bookmarks.id, bookmarkId),
					);
					expect(after).toBeUndefined();
				});
			});
		});
	},
);
