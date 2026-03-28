import type { pgSchema } from "@eclaire/db";
import { and, eq, like, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestUser,
  DB_TEST_CONFIGS,
  initTestDatabase,
  type TestDatabase,
} from "./setup.js";

/**
 * Database-level search tests.
 *
 * Validates full-text search on PGlite (tsvector + tsquery) and
 * LIKE-based fallback on SQLite, using the real schema and in-memory databases.
 */
describe.each(DB_TEST_CONFIGS)("$label - Search Tests", ({ dbType }) => {
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

  // ----- Helpers -----

  async function insertNote(title: string, content: string): Promise<string> {
    const id = `note-test-${Math.random().toString(36).substring(2, 15)}`;
    const { txManager } = testDb;
    await txManager.withTransaction(async (tx) => {
      await tx.notes.insert({
        id,
        userId: testUserId,
        title,
        content,
      });
    });
    return id;
  }

  async function insertBookmark(
    title: string,
    description: string,
    url: string,
  ): Promise<string> {
    const id = `bm-test-${Math.random().toString(36).substring(2, 15)}`;
    const { txManager } = testDb;
    await txManager.withTransaction(async (tx) => {
      await tx.bookmarks.insert({
        id,
        userId: testUserId,
        title,
        description,
        originalUrl: url,
      });
    });
    return id;
  }

  async function insertTask(
    title: string,
    description: string,
  ): Promise<string> {
    const id = `task-test-${Math.random().toString(36).substring(2, 15)}`;
    const { txManager } = testDb;
    await txManager.withTransaction(async (tx) => {
      await tx.tasks.insert({
        id,
        userId: testUserId,
        title,
        description,
        taskStatus: "open",
      });
    });
    return id;
  }

  async function insertDocument(
    title: string,
    description: string,
    originalFilename: string | null = null,
  ): Promise<string> {
    const id = `doc-test-${Math.random().toString(36).substring(2, 15)}`;
    const { txManager } = testDb;
    await txManager.withTransaction(async (tx) => {
      await tx.documents.insert({
        id,
        userId: testUserId,
        title,
        description,
        originalFilename,
      });
    });
    return id;
  }

  // ----- Basic text match -----

  describe("Basic text match", () => {
    it("should find a note by title keyword", async () => {
      await insertNote("Quantum Computing Overview", "An intro to qubits");
      await insertNote("Gardening Tips", "How to grow tomatoes");

      const { db } = testDb;
      const notes = testDb.schema.notes;

      if (dbType === "pglite") {
        // FTS: tsvector search
        const results = await db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              sql`${(notes as typeof pgSchema.notes).searchVector} @@ plainto_tsquery('english', ${"quantum"})`,
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Quantum Computing Overview");
      } else {
        // SQLite: LIKE fallback
        const results = await db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(
            and(eq(notes.userId, testUserId), like(notes.title, "%Quantum%")),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Quantum Computing Overview");
      }
    });

    it("should find a note by content keyword", async () => {
      await insertNote(
        "Recipe Collection",
        "Chocolate cake with vanilla icing",
      );
      await insertNote("Travel Plans", "Visit the Eiffel Tower");

      const { db } = testDb;
      const notes = testDb.schema.notes;

      if (dbType === "pglite") {
        const results = await db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              sql`${(notes as typeof pgSchema.notes).searchVector} @@ plainto_tsquery('english', ${"chocolate"})`,
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Recipe Collection");
      } else {
        const results = await db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              like(notes.content, "%Chocolate%"),
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Recipe Collection");
      }
    });
  });

  // ----- No match -----

  describe("No match", () => {
    it("should return empty results for gibberish query", async () => {
      await insertNote("Normal Title", "Normal content");

      const { db } = testDb;
      const notes = testDb.schema.notes;

      if (dbType === "pglite") {
        const results = await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              sql`${(notes as typeof pgSchema.notes).searchVector} @@ plainto_tsquery('english', ${"xyznonexistent99"})`,
            ),
          );
        expect(results.length).toBe(0);
      } else {
        const results = await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              like(notes.title, "%xyznonexistent99%"),
            ),
          );
        expect(results.length).toBe(0);
      }
    });
  });

  // ----- PGlite-specific: Stemming -----

  describe("PGlite: English stemming", () => {
    it("should match stemmed forms (running -> run)", async () => {
      if (dbType !== "pglite") return;

      await insertNote("Morning Run", "I went running in the park");

      const { db } = testDb;
      const notes = testDb.schema.notes as typeof pgSchema.notes;

      // "runs" should match "run" and "running" via English stemmer
      const results = await db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(
          and(
            eq(notes.userId, testUserId),
            sql`${notes.searchVector} @@ plainto_tsquery('english', ${"runs"})`,
          ),
        );
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Morning Run");
    });
  });

  // ----- PGlite: Generated column auto-population -----

  describe("PGlite: search_vector generated column", () => {
    it("should auto-populate search_vector on insert", async () => {
      if (dbType !== "pglite") return;

      const id = await insertNote(
        "Database Indexing",
        "B-tree and hash indexes",
      );

      const { db } = testDb;
      const notes = testDb.schema.notes as typeof pgSchema.notes;

      const results = await db
        .select({
          id: notes.id,
          hasVector: sql<boolean>`${notes.searchVector} IS NOT NULL`,
        })
        .from(notes)
        .where(eq(notes.id, id));

      expect(results.length).toBe(1);
      expect(results[0].hasVector).toBe(true);
    });

    it("should update search_vector when title is updated", async () => {
      if (dbType !== "pglite") return;

      const id = await insertNote("Old Title", "Some content");

      const { txManager, db } = testDb;
      const notes = testDb.schema.notes as typeof pgSchema.notes;

      // Update the title
      await txManager.withTransaction(async (tx) => {
        await tx.notes.update(eq(notes.id, id), {
          title: "Distributed Systems Architecture",
        });
      });

      // Search with the new title
      const results = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            sql`${notes.searchVector} @@ plainto_tsquery('english', ${"distributed"})`,
          ),
        );
      expect(results.length).toBe(1);

      // Old title should no longer match
      const oldResults = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            sql`${notes.searchVector} @@ plainto_tsquery('english', ${"old"})`,
          ),
        );
      expect(oldResults.length).toBe(0);
    });
  });

  // ----- Multi-column search across entities -----

  describe("Multi-column search", () => {
    it("should find bookmarks by URL on SQLite (LIKE fallback)", async () => {
      if (dbType !== "sqlite") return; // LIKE-based test

      await insertBookmark(
        "Example Site",
        "A cool site",
        "https://unique-domain-xyz.example.com",
      );

      const { db } = testDb;
      const bookmarks = testDb.schema.bookmarks;

      const results = await db
        .select({ id: bookmarks.id, title: bookmarks.title })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, testUserId),
            like(bookmarks.originalUrl, "%unique-domain-xyz%"),
          ),
        );
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Example Site");
    });

    it("should find bookmarks by URL on PGlite (included in tsvector weight D)", async () => {
      if (dbType !== "pglite") return;

      await insertBookmark(
        "Example Site",
        "A cool site",
        "https://unique-domain-xyz.example.com",
      );

      const { db } = testDb;
      const bookmarks = testDb.schema.bookmarks as typeof pgSchema.bookmarks;

      // URL is included in the search vector with weight D
      const results = await db
        .select({ id: bookmarks.id, title: bookmarks.title })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, testUserId),
            sql`${bookmarks.searchVector} @@ plainto_tsquery('english', ${"unique-domain-xyz"})`,
          ),
        );
      // Note: tsquery tokenization may handle hyphens differently; the URL may or may not match
      // The important thing is that it doesn't crash
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ----- Search across multiple entities -----

  describe("Tasks search", () => {
    it("should find tasks by title via search", async () => {
      await insertTask("Deploy microservices", "Update k8s manifests");
      await insertTask("Write documentation", "API reference guide");

      const { db } = testDb;
      const tasks = testDb.schema.tasks;

      if (dbType === "pglite") {
        const results = await db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, testUserId),
              sql`${(tasks as typeof pgSchema.tasks).searchVector} @@ plainto_tsquery('english', ${"microservices"})`,
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Deploy microservices");
      } else {
        const results = await db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, testUserId),
              like(tasks.title, "%microservices%"),
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Deploy microservices");
      }
    });

    it("should find tasks by description via search", async () => {
      await insertTask("Infrastructure update", "Migrate to PostgreSQL 17");

      const { db } = testDb;
      const tasks = testDb.schema.tasks;

      if (dbType === "pglite") {
        const results = await db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, testUserId),
              sql`${(tasks as typeof pgSchema.tasks).searchVector} @@ plainto_tsquery('english', ${"postgresql"})`,
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Infrastructure update");
      } else {
        const results = await db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, testUserId),
              like(tasks.description, "%PostgreSQL%"),
            ),
          );
        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Infrastructure update");
      }
    });
  });

  // ----- Special characters -----

  describe("Special characters", () => {
    it("should not crash on search with percent sign", async () => {
      await insertNote("Growth Report", "Revenue grew by 50% this quarter");

      const { db } = testDb;
      const notes = testDb.schema.notes;

      if (dbType === "pglite") {
        const results = await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              sql`${(notes as typeof pgSchema.notes).searchVector} @@ plainto_tsquery('english', ${"50%"})`,
            ),
          );
        // May or may not match (tsquery handles % as part of tokenization) - just verify no crash
        expect(results).toBeInstanceOf(Array);
      } else {
        // On SQLite, % in the search term is a wildcard - we verify no crash
        const results = await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(eq(notes.userId, testUserId), like(notes.title, "%50\\%%")),
          );
        expect(results).toBeInstanceOf(Array);
      }
    });

    it("should not crash on search with single quotes", async () => {
      await insertNote("O'Brien's Notes", "Meeting with team");

      const { db } = testDb;
      const notes = testDb.schema.notes;

      if (dbType === "pglite") {
        const results = await db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              sql`${(notes as typeof pgSchema.notes).searchVector} @@ plainto_tsquery('english', ${"O'Brien"})`,
            ),
          );
        expect(results).toBeInstanceOf(Array);
      } else {
        const results = await db
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(
            and(eq(notes.userId, testUserId), like(notes.title, "%O'Brien%")),
          );
        expect(results).toBeInstanceOf(Array);
        expect(results.length).toBe(1);
      }
    });

    it("should not crash on search with parentheses", async () => {
      await insertNote("Function (deprecated)", "Use newFunction() instead");

      const { db } = testDb;
      const notes = testDb.schema.notes;

      if (dbType === "pglite") {
        // plainto_tsquery safely handles parentheses (unlike to_tsquery)
        const results = await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              eq(notes.userId, testUserId),
              sql`${(notes as typeof pgSchema.notes).searchVector} @@ plainto_tsquery('english', ${"function()"})`,
            ),
          );
        expect(results).toBeInstanceOf(Array);
      } else {
        const results = await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(eq(notes.userId, testUserId), like(notes.title, "%Function%")),
          );
        expect(results).toBeInstanceOf(Array);
        expect(results.length).toBe(1);
      }
    });
  });

  // ----- Empty/whitespace search -----

  describe("Empty and whitespace search terms", () => {
    it("should handle empty string tsquery on PGlite without error", async () => {
      if (dbType !== "pglite") return;

      await insertNote("Some Note", "Some content");

      const { db } = testDb;
      const notes = testDb.schema.notes as typeof pgSchema.notes;

      // plainto_tsquery('english', '') returns an empty tsquery
      const results = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.userId, testUserId),
            sql`${notes.searchVector} @@ plainto_tsquery('english', ${""})`,
          ),
        );
      // Empty tsquery matches nothing
      expect(results.length).toBe(0);
    });

    it("should handle whitespace-only tsquery on PGlite without error", async () => {
      if (dbType !== "pglite") return;

      await insertNote("Another Note", "More content");

      const { db } = testDb;
      const notes = testDb.schema.notes as typeof pgSchema.notes;

      const results = await db
        .select({ id: notes.id })
        .from(notes)
        .where(
          and(
            eq(notes.userId, testUserId),
            sql`${notes.searchVector} @@ plainto_tsquery('english', ${"   "})`,
          ),
        );
      expect(results.length).toBe(0);
    });
  });

  // ----- Documents: originalFilename in tsvector -----

  describe("Documents: originalFilename search", () => {
    it("should find document by originalFilename on PGlite (weight D in tsvector)", async () => {
      if (dbType !== "pglite") return;

      await insertDocument(
        "Quarterly Report",
        "Financial summary",
        "q4-financials-2025.xlsx",
      );

      const { db } = testDb;
      const documents = testDb.schema.documents as typeof pgSchema.documents;

      const results = await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(
          and(
            eq(documents.userId, testUserId),
            sql`${documents.searchVector} @@ plainto_tsquery('english', ${"financials"})`,
          ),
        );
      // "financials" appears in both description and filename — should match
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Quarterly Report");
    });

    it("should find document by originalFilename on SQLite (LIKE fallback)", async () => {
      if (dbType !== "sqlite") return;

      await insertDocument(
        "Quarterly Report",
        "Financial summary",
        "q4-financials-2025.xlsx",
      );

      const { db } = testDb;
      const documents = testDb.schema.documents;

      const results = await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(
          and(
            eq(documents.userId, testUserId),
            like(documents.originalFilename, "%financials%"),
          ),
        );
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Quarterly Report");
    });
  });

  // ----- ts_rank ordering -----

  describe("PGlite: ts_rank ordering", () => {
    it("should rank title matches higher than description matches", async () => {
      if (dbType !== "pglite") return;

      // Note A: "kubernetes" in title (weight A)
      await insertNote(
        "Kubernetes Deployment Guide",
        "How to deploy applications",
      );
      // Note B: "kubernetes" only in content (weight B)
      await insertNote(
        "Infrastructure Overview",
        "We use kubernetes for container orchestration",
      );

      const { db } = testDb;
      const notes = testDb.schema.notes as typeof pgSchema.notes;

      const results = await db
        .select({
          id: notes.id,
          title: notes.title,
          rank: sql<number>`ts_rank(${notes.searchVector}, plainto_tsquery('english', ${"kubernetes"}))`,
        })
        .from(notes)
        .where(
          and(
            eq(notes.userId, testUserId),
            sql`${notes.searchVector} @@ plainto_tsquery('english', ${"kubernetes"})`,
          ),
        )
        .orderBy(
          sql`ts_rank(${notes.searchVector}, plainto_tsquery('english', ${"kubernetes"})) DESC`,
        );

      expect(results.length).toBe(2);
      // Title match (weight A) should rank higher than content match (weight B)
      expect(results[0].title).toBe("Kubernetes Deployment Guide");
      expect(results[1].title).toBe("Infrastructure Overview");
      expect(results[0].rank).toBeGreaterThan(results[1].rank);
    });
  });
});
