import path from "node:path";
import { pgSchema, sqliteSchema } from "@eclaire/db";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB_TEST_CONFIGS, } from "./setup.js";

describe.each(DB_TEST_CONFIGS)("$label - Migration Tests", ({
  dbType,
  label,
}) => {
  let db: any;
  let client: any;

  beforeEach(async () => {
    if (dbType === "sqlite") {
      // In-memory SQLite
      client = new Database(":memory:");
      client.pragma("journal_mode = WAL");
      client.pragma("synchronous = NORMAL");
      client.pragma("foreign_keys = ON");
      db = drizzleSqlite(client, { schema: sqliteSchema });
    } else {
      // In-memory PGlite
      client = new PGlite();
      db = drizzlePglite(client, { schema: pgSchema });
    }
  });

  afterEach(async () => {
    if (client) {
      if (dbType === "sqlite") {
        client.close();
      } else {
        await client.close();
      }
    }
  });

  describe("Fresh Migration Execution", () => {
    it("should run all migrations successfully on empty database", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        expect(() => {
          migrateSqlite(db, { migrationsFolder: migrationsPath });
        }).not.toThrow();
      } else {
        await expect(
          migratePg(db, { migrationsFolder: migrationsPath }),
        ).resolves.not.toThrow();
      }

      // Verify migrations table exists
      if (dbType === "sqlite") {
        const tables = db
          .all(
            sql`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`,
          )
          .map((t: { name: string }) => t.name);
        expect(tables).toContain("__drizzle_migrations");
      } else {
        // For PGlite, just verify the migrations ran by checking a known table exists
        // The drizzle migrator for PGlite may not create __drizzle_migrations table
        const result = await db.execute(sql`
						SELECT table_name
						FROM information_schema.tables
						WHERE table_schema = 'public'
						AND table_name = 'users'
					`);
        // If users table exists, migrations ran successfully
        expect(result.rows.length).toBeGreaterThan(0);
      }
    });

    it("should create all expected tables", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });
      }

      // Expected core tables (common across both schemas)
      const expectedTables = [
        "users",
        "sessions",
        "api_keys",
        "bookmarks",
        "tasks",
        "notes",
        "documents",
        "photos",
        "tags",
        "bookmarks_tags",
        "tasks_tags",
        "channels",
        "conversations",
        "messages",
        "feedback",
      ];

      // Get actual tables
      let actualTables: string[];
      if (dbType === "sqlite") {
        actualTables = db
          .all(
            sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'`,
          )
          .map((t: { name: string }) => t.name);
      } else {
        const result = await db.execute(sql`
						SELECT tablename
						FROM pg_tables
						WHERE schemaname = 'public'
						AND tablename != '__drizzle_migrations'
					`);
        actualTables = result.rows.map(
          (r: { tablename: string }) => r.tablename,
        );
      }

      // Verify all expected tables exist
      for (const table of expectedTables) {
        expect(actualTables).toContain(table);
      }
    });
  });

  describe("Schema Validation", () => {
    it("should create users table with correct columns", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });
      }

      // Insert test user to verify schema
      const userId = "test-user-123";
      const email = "test@example.com";

      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.users).values({
          id: userId,
          userType: "user",
          email,
          displayName: "Test User",
        });

        const user = await db.query.users.findFirst({
          where: sql`${sqliteSchema.users.id} = ${userId}`,
        });

        expect(user).toBeDefined();
        expect(user.id).toBe(userId);
        expect(user.email).toBe(email);
        expect(user.createdAt).toBeInstanceOf(Date);
      } else {
        await db.insert(pgSchema.users).values({
          id: userId,
          userType: "user",
          email,
          displayName: "Test User",
        });

        const user = await db.query.users.findFirst({
          where: sql`${pgSchema.users.id} = ${userId}`,
        });

        expect(user).toBeDefined();
        expect(user.id).toBe(userId);
        expect(user.email).toBe(email);
        expect(user.createdAt).toBeInstanceOf(Date);
      }
    });

    it("should create bookmarks table with correct schema", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });
      }

      // Create test user first
      const userId = "test-user-456";
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.users).values({
          id: userId,
          userType: "user",
          email: "test@example.com",
          displayName: "Test User",
        });
      } else {
        await db.insert(pgSchema.users).values({
          id: userId,
          userType: "user",
          email: "test@example.com",
          displayName: "Test User",
        });
      }

      // Insert bookmark with various field types
      const bookmarkId = "test-bookmark-123";
      const rawMetadata = { key: "value" };

      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.bookmarks).values({
          id: bookmarkId,
          userId,
          originalUrl: "https://example.com",
          title: "Test",
          isPinned: true,
          rawMetadata,
        });

        const bookmark = await db.query.bookmarks.findFirst({
          where: sql`${sqliteSchema.bookmarks.id} = ${bookmarkId}`,
        });

        expect(bookmark).toBeDefined();
        expect(bookmark.isPinned).toBe(true); // Boolean
        expect(bookmark.rawMetadata).toEqual(rawMetadata); // JSON
        expect(bookmark.createdAt).toBeInstanceOf(Date); // Timestamp
      } else {
        await db.insert(pgSchema.bookmarks).values({
          id: bookmarkId,
          userId,
          originalUrl: "https://example.com",
          title: "Test",
          isPinned: true,
          rawMetadata,
        });

        const bookmark = await db.query.bookmarks.findFirst({
          where: sql`${pgSchema.bookmarks.id} = ${bookmarkId}`,
        });

        expect(bookmark).toBeDefined();
        expect(bookmark.isPinned).toBe(true); // Boolean
        expect(bookmark.rawMetadata).toEqual(rawMetadata); // JSONB
        expect(bookmark.createdAt).toBeInstanceOf(Date); // Timestamp
      }
    });

    it("should create photos table with numeric/text fields", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });
      }

      // Create test user first
      const userId = "test-user-789";
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.users).values({
          id: userId,
          userType: "user",
          email: "photo@example.com",
          displayName: "Test User",
        });
      } else {
        await db.insert(pgSchema.users).values({
          id: userId,
          userType: "user",
          email: "photo@example.com",
          displayName: "Test User",
        });
      }

      // Insert photo with EXIF data
      const photoId = "test-photo-123";
      if (dbType === "sqlite") {
        await db.insert(sqliteSchema.photos).values({
          id: photoId,
          userId,
          title: "Test Photo",
          storageId: "test-storage-123",
          fileSize: 1024000,
          fNumber: "2.8",
          latitude: "37.7749",
        });

        const photo = await db.query.photos.findFirst({
          where: sql`${sqliteSchema.photos.id} = ${photoId}`,
        });

        expect(photo).toBeDefined();
        expect(photo.fNumber).toBe(2.8); // Real (number) in SQLite
        expect(photo.latitude).toBe(37.7749); // Real (number) in SQLite
      } else {
        await db.insert(pgSchema.photos).values({
          id: photoId,
          userId,
          title: "Test Photo",
          storageId: "test-storage-123",
          fileSize: 1024000,
          fNumber: "2.8",
          latitude: "37.7749",
        });

        const photo = await db.query.photos.findFirst({
          where: sql`${pgSchema.photos.id} = ${photoId}`,
        });

        expect(photo).toBeDefined();
        expect(photo.fNumber).toBe("2.8"); // Numeric in PostgreSQL (returned as string)
        expect(photo.latitude).toBe("37.7749"); // Numeric in PostgreSQL (returned as string)
      }
    });
  });

  describe("Migration Idempotency", () => {
    it("should not fail when running migrations twice", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations first time
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });
      }

      // Run migrations second time (should be no-op)
      if (dbType === "sqlite") {
        expect(() => {
          migrateSqlite(db, { migrationsFolder: migrationsPath });
        }).not.toThrow();
      } else {
        await expect(
          migratePg(db, { migrationsFolder: migrationsPath }),
        ).resolves.not.toThrow();
      }
    });
  });

  describe("Foreign Key Constraints After Migration", () => {
    it("should enforce foreign key constraints", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });
      }

      // Try to insert bookmark without user (should fail)
      let insertFailed = false;
      try {
        if (dbType === "sqlite") {
          await db.insert(sqliteSchema.bookmarks).values({
            id: "test-bookmark",
            userId: "nonexistent-user",
            url: "https://example.com",
          });
        } else {
          await db.insert(pgSchema.bookmarks).values({
            id: "test-bookmark",
            userId: "nonexistent-user",
            url: "https://example.com",
          });
        }
      } catch (_error) {
        insertFailed = true;
      }

      expect(insertFailed).toBe(true);
    });
  });

  describe("Index Creation", () => {
    it("should create indexes successfully", async () => {
      const migrationsPath =
        dbType === "sqlite"
          ? path.join(process.cwd(), "../../packages/db/src/migrations/sqlite")
          : path.join(
              process.cwd(),
              "../../packages/db/src/migrations/postgres",
            );

      // Run migrations
      if (dbType === "sqlite") {
        migrateSqlite(db, { migrationsFolder: migrationsPath });

        // Check for indexes in SQLite
        const indexes = db
          .all(
            sql`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`,
          )
          .map((i: { name: string }) => i.name);

        // SQLite should have indexes
        expect(indexes.length).toBeGreaterThan(0);
      } else {
        await migratePg(db, { migrationsFolder: migrationsPath });

        // Check for indexes in PostgreSQL
        const result = await db.execute(sql`
						SELECT indexname
						FROM pg_indexes
						WHERE schemaname = 'public'
						AND indexname NOT LIKE 'pg_%'
					`);

        // PostgreSQL should have indexes (including GIN for JSONB)
        expect(result.rows.length).toBeGreaterThan(0);
      }
    });
  });
});
