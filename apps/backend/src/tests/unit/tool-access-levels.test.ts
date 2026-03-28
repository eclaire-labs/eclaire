import { describe, expect, it } from "vitest";
import { getBackendTools } from "../../lib/agent/tools/index.js";

/**
 * Ensure every backend tool has an explicit accessLevel annotation.
 * New tools added without an accessLevel will default to "write" (fail-closed)
 * at runtime, but this test ensures the classification is intentional.
 */
describe("tool access levels", () => {
  const tools = getBackendTools();
  const toolEntries = Object.entries(tools);

  it("has at least one tool", () => {
    expect(toolEntries.length).toBeGreaterThan(0);
  });

  it("every tool has an explicit accessLevel", () => {
    const missing: string[] = [];
    for (const [name, tool] of toolEntries) {
      if (tool.accessLevel === undefined) {
        missing.push(name);
      }
    }
    expect(missing, `Tools without accessLevel: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  const expectedRead = [
    "findContent",
    "findTasks",
    "browseWeb",
    "browseChrome",
    "getTask",
    "getNote",
    "getBookmark",
    "getDocument",
    "getMedia",
    "getPhoto",
    "getTaskComments",
    "getDueItems",
    "getHistory",
    "getMediaInfo",
    "listTags",
    "loadSkill",
    "getUserSettings",
    "getProcessingStatus",
    "manageAdminRead",
  ];

  const expectedWrite = [
    "createNote",
    "createTask",
    "createBookmark",
    "updateTask",
    "updateNote",
    "updateBookmark",
    "updateDocument",
    "updateMedia",
    "updatePhoto",
    "deleteBookmark",
    "deleteNote",
    "deleteTask",
    "deleteDocument",
    "deleteMedia",
    "deletePhoto",
    "importMediaUrl",
    "quickAction",
    "sendNotification",
    "addTaskComment",
    "updateUserSettings",
    "manageAdminWrite",
  ];

  for (const name of expectedRead) {
    it(`${name} is classified as read`, () => {
      const tool = tools[name];
      if (!tool) return; // Tool may not be registered (e.g. audio tools)
      expect(tool.accessLevel).toBe("read");
    });
  }

  for (const name of expectedWrite) {
    it(`${name} is classified as write`, () => {
      const tool = tools[name];
      if (!tool) return;
      expect(tool.accessLevel).toBe("write");
    });
  }
});
