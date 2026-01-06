import { pgSchema, sqliteSchema } from "@eclaire/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanDatabase,
  createTestUser,
  DB_TEST_CONFIGS,
  generateTestBookmarkId,
  generateTestTagId,
  generateTestTaskId,
  initTestDatabase,
  type TestDatabase,
} from "./setup.js";

describe.each(DB_TEST_CONFIGS)("$label - Schema Parity Tests", ({
  dbType,
  label,
}) => {
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

  describe("Default Values", () => {
    it("should apply default value for createdAt", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;
      const beforeInsert = Date.now();

      // Insert without createdAt
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      }

      const afterInsert = Date.now();

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.bookmarks.findFirst({
          where: eq(sqliteSchema.bookmarks.id, bookmarkId),
        });
      } else {
        result = await db.query.bookmarks.findFirst({
          where: eq(pgSchema.bookmarks.id, bookmarkId),
        });
      }

      expect(result).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert);
      expect(result.createdAt.getTime()).toBeLessThanOrEqual(afterInsert);
    });

    it("should apply default value for updatedAt", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;
      const beforeInsert = Date.now();

      // Insert without updatedAt
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      }

      const afterInsert = Date.now();

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.bookmarks.findFirst({
          where: eq(sqliteSchema.bookmarks.id, bookmarkId),
        });
      } else {
        result = await db.query.bookmarks.findFirst({
          where: eq(pgSchema.bookmarks.id, bookmarkId),
        });
      }

      expect(result).toBeDefined();
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert);
      expect(result.updatedAt.getTime()).toBeLessThanOrEqual(afterInsert);
    });

    it("should apply default value false for isPinned", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;

      // Insert without isPinned
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      }

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.bookmarks.findFirst({
          where: eq(sqliteSchema.bookmarks.id, bookmarkId),
        });
      } else {
        result = await db.query.bookmarks.findFirst({
          where: eq(pgSchema.bookmarks.id, bookmarkId),
        });
      }

      expect(result).toBeDefined();
      expect(result.isPinned).toBe(false);
    });

    it("should apply default value 'not-started' for task status", async () => {
      const taskId = generateTestTaskId();
      const { db } = testDb;

      // Insert task without status
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.tasks).values({
          id: taskId,
          userId: testUserId,
          title: "Test Task",
        });
      } else {
        await db.insert(pgSchema.tasks).values({
          id: taskId,
          userId: testUserId,
          title: "Test Task",
        });
      }

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.tasks.findFirst({
          where: eq(sqliteSchema.tasks.id, taskId),
        });
      } else {
        result = await db.query.tasks.findFirst({
          where: eq(pgSchema.tasks.id, taskId),
        });
      }

      expect(result).toBeDefined();
      expect(result.status).toBe("not-started");
    });
  });

  describe("Nullable Fields", () => {
    it("should handle nullable string fields", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;

      // Insert with null title and description
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
          title: null,
          description: null,
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
          title: null,
          description: null,
        });
      }

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.bookmarks.findFirst({
          where: eq(sqliteSchema.bookmarks.id, bookmarkId),
        });
      } else {
        result = await db.query.bookmarks.findFirst({
          where: eq(pgSchema.bookmarks.id, bookmarkId),
        });
      }

      expect(result).toBeDefined();
      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
    });

    it("should handle nullable enum fields", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;

      // Insert with null reviewStatus and flagColor
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
          reviewStatus: null,
          flagColor: null,
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
          reviewStatus: null,
          flagColor: null,
        });
      }

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.bookmarks.findFirst({
          where: eq(sqliteSchema.bookmarks.id, bookmarkId),
        });
      } else {
        result = await db.query.bookmarks.findFirst({
          where: eq(pgSchema.bookmarks.id, bookmarkId),
        });
      }

      expect(result).toBeDefined();
      expect(result.reviewStatus).toBeNull();
      expect(result.flagColor).toBeNull();
    });

    it("should handle nullable timestamp fields", async () => {
      const taskId = generateTestTaskId();
      const { db } = testDb;

      // Insert with null dueDate and completedAt
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.tasks).values({
          id: taskId,
          userId: testUserId,
          title: "Test Task",
          dueDate: null,
          completedAt: null,
        });
      } else {
        await db.insert(pgSchema.tasks).values({
          id: taskId,
          userId: testUserId,
          title: "Test Task",
          dueDate: null,
          completedAt: null,
        });
      }

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.tasks.findFirst({
          where: eq(sqliteSchema.tasks.id, taskId),
        });
      } else {
        result = await db.query.tasks.findFirst({
          where: eq(pgSchema.tasks.id, taskId),
        });
      }

      expect(result).toBeDefined();
      expect(result.dueDate).toBeNull();
      expect(result.completedAt).toBeNull();
    });

    it("should handle nullable JSON fields", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;

      // Insert with null metadata
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
          rawMetadata: null,
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
          rawMetadata: null,
        });
      }

      // Retrieve and verify
      let result: any;
      if (dbType === "sqlite") {
        result = await db.query.bookmarks.findFirst({
          where: eq(sqliteSchema.bookmarks.id, bookmarkId),
        });
      } else {
        result = await db.query.bookmarks.findFirst({
          where: eq(pgSchema.bookmarks.id, bookmarkId),
        });
      }

      expect(result).toBeDefined();
      expect(result.rawMetadata).toBeNull();
    });
  });

  describe("Foreign Key Constraints", () => {
    it("should enforce foreign key constraint on insert", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;
      const nonExistentUserId = "user-nonexistent";

      // Try to insert bookmark with non-existent user
      let insertFailed = false;
      try {
        if (dbType === "sqlite") {
          await db.insert(sqliteSchema.bookmarks).values({
            id: bookmarkId,
            userId: nonExistentUserId,
            originalUrl: "https://example.com",
          });
        } else {
          await db.insert(pgSchema.bookmarks).values({
            id: bookmarkId,
            userId: nonExistentUserId,
            originalUrl: "https://example.com",
          });
        }
      } catch (error) {
        insertFailed = true;
        expect(error).toBeDefined();
      }

      expect(insertFailed).toBe(true);
    });

    it("should cascade delete on parent deletion", async () => {
      const bookmarkId = generateTestBookmarkId();
      const tagId = generateTestTagId();
      const { db } = testDb;

      // Create tag
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.tags).values({
          id: tagId,
          userId: testUserId,
          name: "test-tag",
        });
      } else {
        await db.insert(pgSchema.tags).values({
          id: tagId,
          userId: testUserId,
          name: "test-tag",
        });
      }

      // Create bookmark
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId: testUserId,
          originalUrl: "https://example.com",
        });
      }

      // Create bookmark-tag relationship
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarksTags).values({
          bookmarkId,
          tagId,
        });
      } else {
        await db.insert(pgSchema.bookmarksTags).values({
          bookmarkId,
          tagId,
        });
      }

      // Delete bookmark
      if (dbType === "sqlite") {
        await db
          .delete(sqliteSchema.bookmarks)
          .where(eq(sqliteSchema.bookmarks.id, bookmarkId));
      } else {
        await db
          .delete(pgSchema.bookmarks)
          .where(eq(pgSchema.bookmarks.id, bookmarkId));
      }

      // Verify bookmark-tag relationship was cascade deleted
      let relationship: any;
      if (dbType === "sqlite") {
        relationship = await db.query.bookmarksTags.findFirst({
          where: and(
            eq(sqliteSchema.bookmarksTags.bookmarkId, bookmarkId),
            eq(sqliteSchema.bookmarksTags.tagId, tagId),
          ),
        });
      } else {
        relationship = await db.query.bookmarksTags.findFirst({
          where: and(
            eq(pgSchema.bookmarksTags.bookmarkId, bookmarkId),
            eq(pgSchema.bookmarksTags.tagId, tagId),
          ),
        });
      }

      expect(relationship).toBeUndefined();
    });
  });

  describe("Unique Constraints", () => {
    it("should enforce unique constraint on user email", async () => {
      const { db } = testDb;
      const email = "unique@example.com";

      // Insert first user with email
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.users).values({
          id: "user-1",
          userType: "user",
          email,
          displayName: "User 1",
        });
      } else {
        await db.insert(pgSchema.users).values({
          id: "user-1",
          userType: "user",
          email,
          displayName: "User 1",
        });
      }

      // Try to insert second user with same email
      let insertFailed = false;
      try {
        if (dbType === "sqlite") {
          await db.insert(sqliteSchema.users).values({
            id: "user-2",
            userType: "user",
            email, // Duplicate email
            displayName: "User 2",
          });
        } else {
          await db.insert(pgSchema.users).values({
            id: "user-2",
            userType: "user",
            email, // Duplicate email
            displayName: "User 2",
          });
        }
      } catch (error) {
        insertFailed = true;
        expect(error).toBeDefined();
      }

      expect(insertFailed).toBe(true);
    });

    it("should enforce unique constraint on tag name per user", async () => {
      const tagId1 = generateTestTagId();
      const tagId2 = generateTestTagId();
      const { db } = testDb;
      const tagName = "unique-tag";

      // Insert first tag
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.tags).values({
          id: tagId1,
          userId: testUserId,
          name: tagName,
        });
      } else {
        await db.insert(pgSchema.tags).values({
          id: tagId1,
          userId: testUserId,
          name: tagName,
        });
      }

      // Try to insert second tag with same name for same user
      let insertFailed = false;
      try {
        if (dbType === "sqlite") {
          await db.insert(sqliteSchema.tags).values({
            id: tagId2,
            userId: testUserId,
            name: tagName, // Duplicate
          });
        } else {
          await db.insert(pgSchema.tags).values({
            id: tagId2,
            userId: testUserId,
            name: tagName, // Duplicate
          });
        }
      } catch (error) {
        insertFailed = true;
        expect(error).toBeDefined();
      }

      expect(insertFailed).toBe(true);
    });
  });

  describe("NOT NULL Constraints", () => {
    it("should enforce NOT NULL on required fields", async () => {
      const bookmarkId = generateTestBookmarkId();
      const { db } = testDb;

      // Try to insert bookmark without required url field
      let insertFailed = false;
      try {
        if (dbType === "sqlite") {
          await db.insert(sqliteSchema.bookmarks).values({
            id: bookmarkId,
            userId: testUserId,
            url: null as any, // Violates NOT NULL
          });
        } else {
          await db.insert(pgSchema.bookmarks).values({
            id: bookmarkId,
            userId: testUserId,
            url: null as any, // Violates NOT NULL
          });
        }
      } catch (error) {
        insertFailed = true;
        expect(error).toBeDefined();
      }

      expect(insertFailed).toBe(true);
    });
  });
});
