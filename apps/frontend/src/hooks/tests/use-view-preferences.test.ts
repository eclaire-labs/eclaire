// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import type { PageType } from "@/hooks/use-view-preferences";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("useViewPreferences", () => {
  // ── Defaults ──────────────────────────────────────────────────────────

  it("returns default preferences when localStorage is empty", () => {
    const { result } = renderHook(() => useViewPreferences("notes"));
    const [prefs] = result.current;

    expect(prefs.sortBy).toBe("createdAt");
    expect(prefs.sortDir).toBe("desc");
    expect(prefs.viewMode).toBe("tile");
  });

  it("returns correct defaults for each page type", () => {
    const expected: Record<PageType, string> = {
      bookmarks: "createdAt",
      tasks: "dueDate",
      notes: "createdAt",
      documents: "createdAt",
      photos: "dateTaken",
    };

    for (const [pageType, expectedSortBy] of Object.entries(expected)) {
      const { result } = renderHook(() =>
        useViewPreferences(pageType as PageType),
      );
      expect(result.current[0].sortBy).toBe(expectedSortBy);
    }
  });

  // ── Valid stored preferences ──────────────────────────────────────────

  it("restores valid preferences from localStorage", () => {
    localStorage.setItem(
      "view-preferences-notes",
      JSON.stringify({ sortBy: "title", sortDir: "asc" }),
    );

    const { result } = renderHook(() => useViewPreferences("notes"));
    const [prefs] = result.current;

    expect(prefs.sortBy).toBe("title");
    expect(prefs.sortDir).toBe("asc");
  });

  // ── Stale / invalid sortBy sanitization ───────────────────────────────

  it("falls back to default when stored sortBy is invalid", () => {
    localStorage.setItem(
      "view-preferences-notes",
      JSON.stringify({ sortBy: "date" }),
    );

    const { result } = renderHook(() => useViewPreferences("notes"));
    expect(result.current[0].sortBy).toBe("createdAt");
  });

  it("falls back to default for each page type with an invalid sortBy", () => {
    const cases: [PageType, string][] = [
      ["bookmarks", "date"],
      ["tasks", "createdAt"], // not valid for tasks
      ["notes", "date"],
      ["documents", "date"],
      ["photos", "date"],
    ];

    for (const [pageType, invalidSortBy] of cases) {
      localStorage.setItem(
        `view-preferences-${pageType}`,
        JSON.stringify({ sortBy: invalidSortBy }),
      );

      const { result } = renderHook(() => useViewPreferences(pageType));
      const defaults: Record<PageType, string> = {
        bookmarks: "createdAt",
        tasks: "dueDate",
        notes: "createdAt",
        documents: "createdAt",
        photos: "dateTaken",
      };
      expect(result.current[0].sortBy).toBe(defaults[pageType]);
    }
  });

  it("preserves other fields when sortBy is invalid", () => {
    localStorage.setItem(
      "view-preferences-notes",
      JSON.stringify({ sortBy: "date", viewMode: "list", sortDir: "asc" }),
    );

    const { result } = renderHook(() => useViewPreferences("notes"));
    const [prefs] = result.current;

    expect(prefs.sortBy).toBe("createdAt"); // sanitized
    expect(prefs.viewMode).toBe("list"); // preserved
    expect(prefs.sortDir).toBe("asc"); // preserved
  });

  // ── Malformed localStorage ────────────────────────────────────────────

  it("falls back to defaults when localStorage contains invalid JSON", () => {
    localStorage.setItem("view-preferences-notes", "not-json");

    const { result } = renderHook(() => useViewPreferences("notes"));
    expect(result.current[0].sortBy).toBe("createdAt");
  });

  // ── Update preferences ────────────────────────────────────────────────

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => useViewPreferences("notes"));

    act(() => {
      result.current[1]("sortBy", "title");
    });

    expect(result.current[0].sortBy).toBe("title");

    const stored = JSON.parse(
      localStorage.getItem("view-preferences-notes") ?? "{}",
    );
    expect(stored.sortBy).toBe("title");
  });
});
