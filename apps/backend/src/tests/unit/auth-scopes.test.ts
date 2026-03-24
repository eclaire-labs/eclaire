import { describe, expect, it } from "vitest";
import {
  assertPrincipalScopes,
  inferRequiredScopesForRequest,
  normalizeGrantedScopes,
  type AuthPrincipal,
} from "../../lib/auth-principal.js";
import { ForbiddenError } from "../../lib/errors.js";

function makeApiKeyPrincipal(scopes: string[]): AuthPrincipal {
  return {
    actorId: "test-actor",
    actorKind: "human",
    ownerUserId: "test-user",
    grantId: "test-grant",
    grantedByActorId: null,
    credentialId: "test-cred",
    authMethod: "api_key",
    scopes: scopes as AuthPrincipal["scopes"],
  };
}

function makeSessionPrincipal(): AuthPrincipal {
  return {
    actorId: "test-actor",
    actorKind: "human",
    ownerUserId: "test-user",
    grantId: null,
    grantedByActorId: null,
    credentialId: null,
    authMethod: "session",
    scopes: ["*"],
  };
}

describe("inferRequiredScopesForRequest", () => {
  describe("covers all route families", () => {
    const routeExpectations: [string, string, string[]][] = [
      // [path, method, expectedScopes]
      ["/api/admin/settings", "GET", ["admin:read"]],
      ["/api/admin/users", "POST", ["admin:write"]],
      ["/api/user/api-keys", "GET", ["credentials:read"]],
      ["/api/user/api-keys/123", "DELETE", ["credentials:write"]],
      ["/api/actors/credential-scopes", "GET", ["credentials:read"]],
      ["/api/actors/abc/api-keys", "GET", ["credentials:read"]],
      ["/api/actors/abc/api-keys/xyz", "DELETE", ["credentials:write"]],
      ["/api/actors", "GET", ["actors:read"]],
      ["/api/actors/services", "POST", ["actors:write"]],
      ["/api/agents", "GET", ["agents:read"]],
      ["/api/agents/123", "PUT", ["agents:write"]],
      ["/api/channels", "GET", ["channels:read"]],
      ["/api/channels/123", "DELETE", ["channels:write"]],
      ["/api/notifications", "POST", ["notifications:write"]],
      ["/api/tasks", "GET", ["tasks:read"]],
      ["/api/tasks/123", "PUT", ["tasks:write"]],
      ["/api/sessions", "GET", ["conversations:read"]],
      ["/api/sessions/123/messages", "POST", ["conversations:write"]],
      ["/api/history", "GET", ["history:read"]],
      ["/api/processing-status/summary", "GET", ["processing:read"]],
      [
        "/api/processing-status/bookmark/123/retry",
        "POST",
        ["processing:write"],
      ],
      ["/api/processing-events/stream", "GET", ["processing:read"]],
      ["/api/feedback", "GET", ["feedback:read"]],
      ["/api/feedback", "POST", ["feedback:write"]],
      ["/api/model", "GET", ["model:read"]],
      ["/api/models", "GET", ["model:read"]],
      ["/api/user", "GET", ["profile:read"]],
      ["/api/user/preferences", "PATCH", ["profile:write"]],
      ["/api/bookmarks", "GET", ["assets:read"]],
      ["/api/bookmarks/123", "DELETE", ["assets:write"]],
      ["/api/documents", "GET", ["assets:read"]],
      ["/api/documents/123", "POST", ["assets:write"]],
      ["/api/photos", "GET", ["assets:read"]],
      ["/api/notes", "GET", ["assets:read"]],
      ["/api/tags", "GET", ["assets:read"]],
      ["/api/all", "GET", ["assets:read"]],
      ["/api/all", "POST", ["assets:write"]],
      ["/api/audio/health", "GET", ["audio:read"]],
      ["/api/audio/transcriptions", "POST", ["audio:write"]],
      ["/api/audio/speech", "POST", ["audio:write"]],
      ["/api/audio/transcriptions/stream", "GET", ["audio:read"]],
      ["/api/instance/defaults", "GET", ["profile:read"]],
      ["/api/instance/registration-status", "GET", ["profile:read"]],
    ];

    for (const [path, method, expected] of routeExpectations) {
      it(`${method} ${path} → ${expected.join(", ")}`, () => {
        expect(inferRequiredScopesForRequest(path, method)).toEqual(expected);
      });
    }
  });

  it("returns null for unrecognized routes", () => {
    expect(
      inferRequiredScopesForRequest("/api/unknown-route", "GET"),
    ).toBeNull();
  });
});

describe("assertPrincipalScopes", () => {
  it("allows session auth regardless of scopes", () => {
    const principal = makeSessionPrincipal();
    expect(() =>
      assertPrincipalScopes(principal, ["admin:write"]),
    ).not.toThrow();
    expect(() => assertPrincipalScopes(principal, null)).not.toThrow();
  });

  describe("fail-closed for API key auth", () => {
    it("throws when requiredScopes is null", () => {
      const principal = makeApiKeyPrincipal(["assets:read"]);
      expect(() => assertPrincipalScopes(principal, null)).toThrow(
        ForbiddenError,
      );
    });

    it("throws when requiredScopes is undefined", () => {
      const principal = makeApiKeyPrincipal(["assets:read"]);
      expect(() => assertPrincipalScopes(principal, undefined)).toThrow(
        ForbiddenError,
      );
    });
  });

  it("allows API key with matching scope", () => {
    const principal = makeApiKeyPrincipal(["assets:read"]);
    expect(() =>
      assertPrincipalScopes(principal, ["assets:read"]),
    ).not.toThrow();
  });

  it("allows API key with full access scope", () => {
    const principal = makeApiKeyPrincipal(["*"]);
    expect(() =>
      assertPrincipalScopes(principal, ["admin:write"]),
    ).not.toThrow();
  });

  it("denies API key without matching scope", () => {
    const principal = makeApiKeyPrincipal(["assets:read"]);
    expect(() => assertPrincipalScopes(principal, ["admin:write"])).toThrow(
      ForbiddenError,
    );
  });

  it("allows when any required scope matches (OR logic)", () => {
    const principal = makeApiKeyPrincipal(["tasks:read"]);
    expect(() =>
      assertPrincipalScopes(principal, ["assets:read", "tasks:read"]),
    ).not.toThrow();
  });

  it("allows empty requiredScopes array", () => {
    const principal = makeApiKeyPrincipal(["assets:read"]);
    expect(() => assertPrincipalScopes(principal, [])).not.toThrow();
  });
});

describe("normalizeGrantedScopes", () => {
  it("expands write scopes to include implied read scopes", () => {
    const result = normalizeGrantedScopes(["assets:write"]);
    expect(result).toContain("assets:write");
    expect(result).toContain("assets:read");
  });

  it("expands processing:write to include processing:read", () => {
    const result = normalizeGrantedScopes(["processing:write"]);
    expect(result).toContain("processing:write");
    expect(result).toContain("processing:read");
  });

  it("expands audio:write to include audio:read", () => {
    const result = normalizeGrantedScopes(["audio:write"]);
    expect(result).toContain("audio:write");
    expect(result).toContain("audio:read");
  });

  it("returns full access when * is present", () => {
    const result = normalizeGrantedScopes(["*", "assets:read"]);
    expect(result).toEqual(["*"]);
  });

  it("defaults to full access when scopes are empty", () => {
    const result = normalizeGrantedScopes([]);
    expect(result).toEqual(["*"]);
  });

  it("defaults to full access when scopes are null", () => {
    const result = normalizeGrantedScopes(null);
    expect(result).toEqual(["*"]);
  });
});
