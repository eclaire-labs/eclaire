import { describe, expect, it } from "vitest";
import {
  getMobileTabFromPathname,
  getRouteForMobileTab,
  shouldShowFolders,
} from "@/lib/mobile-navigation";

describe("Mobile Navigation Utils", () => {
  describe("getMobileTabFromPathname", () => {
    it("should return chat for dashboard path", () => {
      expect(getMobileTabFromPathname("/dashboard")).toBe("chat");
    });

    it("should return settings for settings path", () => {
      expect(getMobileTabFromPathname("/settings")).toBe("settings");
    });

    it("should return folders for content paths", () => {
      expect(getMobileTabFromPathname("/all")).toBe("folders");
      expect(getMobileTabFromPathname("/tasks")).toBe("folders");
      expect(getMobileTabFromPathname("/notes/123")).toBe("folders");
      expect(getMobileTabFromPathname("/bookmarks")).toBe("folders");
      expect(getMobileTabFromPathname("/documents/abc")).toBe("folders");
      expect(getMobileTabFromPathname("/photos")).toBe("folders");
      expect(getMobileTabFromPathname("/history")).toBe("folders");
      expect(getMobileTabFromPathname("/processing")).toBe("folders");
      expect(getMobileTabFromPathname("/upload")).toBe("folders");
    });

    it("should return chat for unknown paths", () => {
      expect(getMobileTabFromPathname("/unknown")).toBe("chat");
    });
  });

  describe("shouldShowFolders", () => {
    it("should show folders when on folders tab and content path", () => {
      expect(shouldShowFolders("/all", "folders")).toBe(true);
      expect(shouldShowFolders("/tasks", "folders")).toBe(true);
    });

    it("should not show folders when not on folders tab", () => {
      expect(shouldShowFolders("/all", "chat")).toBe(false);
      expect(shouldShowFolders("/tasks", "chat")).toBe(false);
    });

    it("should not show folders when on folders tab but not content path", () => {
      expect(shouldShowFolders("/dashboard", "folders")).toBe(false);
    });
  });

  describe("getRouteForMobileTab", () => {
    it("should return correct routes for navigational tabs", () => {
      expect(getRouteForMobileTab("chat")).toBe(null);
      expect(getRouteForMobileTab("settings")).toBe("/settings");
    });

    it("should return null for overlay tabs", () => {
      expect(getRouteForMobileTab("chat")).toBe(null);
      expect(getRouteForMobileTab("folders")).toBe(null);
    });
  });
});
