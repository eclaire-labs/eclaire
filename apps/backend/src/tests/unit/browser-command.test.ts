import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBrowserCommand } from "../../lib/browser/command.js";

describe("resolveBrowserCommand", () => {
  it("finds the chrome-devtools-mcp binary in the backend package bin directory", () => {
    const resolved = resolveBrowserCommand("chrome-devtools-mcp");

    expect(resolved).toBeTruthy();
    expect(resolved).toBe(
      path.resolve(process.cwd(), "node_modules/.bin/chrome-devtools-mcp"),
    );
  });
});
