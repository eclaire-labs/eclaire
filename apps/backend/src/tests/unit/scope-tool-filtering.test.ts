import { describe, expect, it } from "vitest";
import { selectAgentTools } from "../../lib/agent/prompt-service.js";
import type { AgentDefinition, UserContext } from "../../lib/agent/types.js";
import { getBackendTools } from "../../lib/agent/tools/index.js";

/** Stub agent that requests all known tools. */
function allToolsAgent(): AgentDefinition {
  return {
    id: "test-agent",
    kind: "builtin",
    name: "Test Agent",
    description: "test",
    systemPrompt: "",
    toolNames: Object.keys(getBackendTools()),
    skillNames: [],
    isEditable: false,
  };
}

const adminUserContext: UserContext = {
  isInstanceAdmin: true,
  displayName: "Test User",
  fullName: null,
  bio: null,
  timezone: null,
  city: null,
  country: null,
};

const regularUserContext: UserContext = {
  isInstanceAdmin: false,
  displayName: "Test User",
  fullName: null,
  bio: null,
  timezone: null,
  city: null,
  country: null,
};

describe("selectAgentTools scope-based filtering", () => {
  it("session user (no scopes) gets all tools", () => {
    const tools = selectAgentTools(allToolsAgent(), adminUserContext, null);
    const names = Object.keys(tools);
    expect(names).toContain("findNotes");
    expect(names).toContain("createNote");
    expect(names).toContain("deleteNote");
    expect(names).toContain("manageAdminRead");
    expect(names).toContain("manageAdminWrite");
  });

  it("full-access API key gets all tools", () => {
    const tools = selectAgentTools(allToolsAgent(), adminUserContext, ["*"]);
    const names = Object.keys(tools);
    expect(names).toContain("findNotes");
    expect(names).toContain("createNote");
    expect(names).toContain("manageAdminWrite");
  });

  it("read-only data key gets only read tools", () => {
    const readOnlyScopes = [
      "conversations:invoke",
      "conversations:read",
      "assets:read",
    ];
    const tools = selectAgentTools(
      allToolsAgent(),
      regularUserContext,
      readOnlyScopes,
    );
    const names = Object.keys(tools);

    // Should have read tools
    expect(names).toContain("findNotes");
    expect(names).toContain("findBookmarks");
    expect(names).toContain("searchAll");
    expect(names).toContain("getTask");
    expect(names).toContain("countNotes");

    // Should NOT have write tools
    expect(names).not.toContain("createNote");
    expect(names).not.toContain("updateNote");
    expect(names).not.toContain("deleteNote");
    expect(names).not.toContain("createTask");
    expect(names).not.toContain("sendNotification");
    expect(names).not.toContain("quickAction");

    // Should NOT have admin tools (non-admin user)
    expect(names).not.toContain("manageAdminRead");
    expect(names).not.toContain("manageAdminWrite");
  });

  it("read-write data key gets all non-admin tools", () => {
    const rwScopes = [
      "conversations:write",
      "conversations:invoke",
      "conversations:read",
      "assets:read",
      "assets:write",
    ];
    const tools = selectAgentTools(
      allToolsAgent(),
      regularUserContext,
      rwScopes,
    );
    const names = Object.keys(tools);

    expect(names).toContain("findNotes");
    expect(names).toContain("createNote");
    expect(names).toContain("updateNote");
    expect(names).toContain("deleteNote");

    // Non-admin user should not have admin tools
    expect(names).not.toContain("manageAdminRead");
    expect(names).not.toContain("manageAdminWrite");
  });

  it("admin user with admin:read scope gets manageAdminRead but not manageAdminWrite", () => {
    const scopes = ["conversations:invoke", "conversations:read", "admin:read"];
    const tools = selectAgentTools(allToolsAgent(), adminUserContext, scopes);
    const names = Object.keys(tools);

    expect(names).toContain("manageAdminRead");
    expect(names).not.toContain("manageAdminWrite");
  });

  it("admin user with admin:write scope gets both admin tools", () => {
    const scopes = [
      "conversations:write",
      "conversations:invoke",
      "conversations:read",
      "admin:read",
      "admin:write",
    ];
    const tools = selectAgentTools(allToolsAgent(), adminUserContext, scopes);
    const names = Object.keys(tools);

    expect(names).toContain("manageAdminRead");
    expect(names).toContain("manageAdminWrite");
  });

  it("admin user with no admin scope gets no admin tools", () => {
    const scopes = [
      "conversations:write",
      "conversations:invoke",
      "conversations:read",
    ];
    const tools = selectAgentTools(allToolsAgent(), adminUserContext, scopes);
    const names = Object.keys(tools);

    expect(names).not.toContain("manageAdminRead");
    expect(names).not.toContain("manageAdminWrite");
  });

  it("non-admin user never gets admin tools even with admin scopes", () => {
    const scopes = ["conversations:write", "admin:read", "admin:write"];
    const tools = selectAgentTools(allToolsAgent(), regularUserContext, scopes);
    const names = Object.keys(tools);

    expect(names).not.toContain("manageAdminRead");
    expect(names).not.toContain("manageAdminWrite");
  });
});
