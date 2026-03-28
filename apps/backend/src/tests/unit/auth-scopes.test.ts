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
      ["/api/sessions/123/messages", "POST", ["conversations:invoke"]],
      ["/api/sessions", "POST", ["conversations:write"]],
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
      ["/api/speech/health", "GET", ["speech:read"]],
      ["/api/speech/transcriptions", "POST", ["speech:write"]],
      ["/api/speech/synthesis", "POST", ["speech:write"]],
      ["/api/speech/transcriptions/stream", "GET", ["speech:read"]],
      ["/api/media", "GET", ["media:read"]],
      ["/api/media/123", "DELETE", ["media:write"]],
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

  it("expands conversations:invoke to include conversations:read", () => {
    const result = normalizeGrantedScopes(["conversations:invoke"]);
    expect(result).toContain("conversations:invoke");
    expect(result).toContain("conversations:read");
  });

  it("expands conversations:write to include conversations:invoke and conversations:read", () => {
    const result = normalizeGrantedScopes(["conversations:write"]);
    expect(result).toContain("conversations:write");
    expect(result).toContain("conversations:invoke");
    expect(result).toContain("conversations:read");
  });

  it("expands processing:write to include processing:read", () => {
    const result = normalizeGrantedScopes(["processing:write"]);
    expect(result).toContain("processing:write");
    expect(result).toContain("processing:read");
  });

  it("expands speech:write to include speech:read", () => {
    const result = normalizeGrantedScopes(["speech:write"]);
    expect(result).toContain("speech:write");
    expect(result).toContain("speech:read");
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

  it("expands media:write to include media:read", () => {
    const result = normalizeGrantedScopes(["media:write"]);
    expect(result).toContain("media:write");
    expect(result).toContain("media:read");
  });

  it("expands credentials:write to include credentials:read", () => {
    const result = normalizeGrantedScopes(["credentials:write"]);
    expect(result).toContain("credentials:write");
    expect(result).toContain("credentials:read");
  });

  it("expands actors:write to include actors:read", () => {
    const result = normalizeGrantedScopes(["actors:write"]);
    expect(result).toContain("actors:write");
    expect(result).toContain("actors:read");
  });

  it("expands admin:write to include admin:read", () => {
    const result = normalizeGrantedScopes(["admin:write"]);
    expect(result).toContain("admin:write");
    expect(result).toContain("admin:read");
  });

  it("expands tasks:write to include tasks:read", () => {
    const result = normalizeGrantedScopes(["tasks:write"]);
    expect(result).toContain("tasks:write");
    expect(result).toContain("tasks:read");
  });

  it("expands channels:write to include channels:read", () => {
    const result = normalizeGrantedScopes(["channels:write"]);
    expect(result).toContain("channels:write");
    expect(result).toContain("channels:read");
  });

  it("expands agents:write to include agents:read", () => {
    const result = normalizeGrantedScopes(["agents:write"]);
    expect(result).toContain("agents:write");
    expect(result).toContain("agents:read");
  });

  it("expands profile:write to include profile:read", () => {
    const result = normalizeGrantedScopes(["profile:write"]);
    expect(result).toContain("profile:write");
    expect(result).toContain("profile:read");
  });

  it("expands feedback:write to include feedback:read", () => {
    const result = normalizeGrantedScopes(["feedback:write"]);
    expect(result).toContain("feedback:write");
    expect(result).toContain("feedback:read");
  });
});

describe("inferRequiredScopesForRequest — unrecognized routes", () => {
  it("returns null for /api/browser/status (fail-closed)", () => {
    expect(
      inferRequiredScopesForRequest("/api/browser/status", "GET"),
    ).toBeNull();
  });

  it("returns null for /api/auth/sign-in (fail-closed)", () => {
    expect(
      inferRequiredScopesForRequest("/api/auth/sign-in", "POST"),
    ).toBeNull();
  });
});
