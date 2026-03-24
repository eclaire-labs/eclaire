import { describe, expect, it } from "vitest";
import {
  DATA_ACCESS_SCOPES,
  ADMIN_ACCESS_SCOPES,
  resolvePermissionScopes,
  derivePermissionLevels,
  type DataAccessLevel,
  type AdminAccessLevel,
} from "@eclaire/api-types";

describe("resolvePermissionScopes", () => {
  it("read + none returns only read scopes", () => {
    const scopes = resolvePermissionScopes("read", "none");
    expect(scopes).toEqual(DATA_ACCESS_SCOPES.read);
  });

  it("read_write + none includes read and write scopes", () => {
    const scopes = resolvePermissionScopes("read_write", "none");
    expect(scopes).toEqual(DATA_ACCESS_SCOPES.read_write);
    for (const readScope of DATA_ACCESS_SCOPES.read) {
      expect(scopes).toContain(readScope);
    }
  });

  it("read + read includes admin:read", () => {
    const scopes = resolvePermissionScopes("read", "read");
    expect(scopes).toContain("admin:read");
    expect(scopes).not.toContain("admin:write");
  });

  it("read_write + read_write is a superset of all other combinations", () => {
    const fullScopes = new Set(
      resolvePermissionScopes("read_write", "read_write"),
    );
    const dataLevels: DataAccessLevel[] = ["read", "read_write"];
    const adminLevels: AdminAccessLevel[] = ["none", "read", "read_write"];

    for (const data of dataLevels) {
      for (const admin of adminLevels) {
        const scopes = resolvePermissionScopes(data, admin);
        for (const scope of scopes) {
          expect(fullScopes.has(scope)).toBe(true);
        }
      }
    }
  });

  it("never includes credentials:* or actors:* scopes", () => {
    const dataLevels: DataAccessLevel[] = ["read", "read_write"];
    const adminLevels: AdminAccessLevel[] = ["none", "read", "read_write"];

    for (const data of dataLevels) {
      for (const admin of adminLevels) {
        const scopes = resolvePermissionScopes(data, admin);
        expect(scopes).not.toContain("credentials:read");
        expect(scopes).not.toContain("credentials:write");
        expect(scopes).not.toContain("actors:read");
        expect(scopes).not.toContain("actors:write");
        expect(scopes).not.toContain("*");
      }
    }
  });
});

describe("derivePermissionLevels", () => {
  it("correctly identifies all 6 combinations", () => {
    const dataLevels: DataAccessLevel[] = ["read", "read_write"];
    const adminLevels: AdminAccessLevel[] = ["none", "read", "read_write"];

    for (const data of dataLevels) {
      for (const admin of adminLevels) {
        const scopes = resolvePermissionScopes(data, admin);
        const result = derivePermissionLevels(scopes);
        expect(result).toEqual({ dataAccess: data, adminAccess: admin });
      }
    }
  });

  it('returns null for ["*"] (full access legacy)', () => {
    expect(derivePermissionLevels(["*"])).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(derivePermissionLevels([])).toBeNull();
  });

  it("returns null for custom scope combinations", () => {
    expect(derivePermissionLevels(["assets:read", "tasks:write"])).toBeNull();
  });

  it("returns null when extra scopes are present", () => {
    const scopes = [
      ...resolvePermissionScopes("read", "none"),
      "credentials:read" as const,
    ];
    expect(derivePermissionLevels(scopes)).toBeNull();
  });
});

describe("scope constants", () => {
  it("read_write data scopes are a superset of read scopes", () => {
    const readWriteSet = new Set(DATA_ACCESS_SCOPES.read_write);
    for (const scope of DATA_ACCESS_SCOPES.read) {
      expect(readWriteSet.has(scope)).toBe(true);
    }
  });

  it("admin read_write includes admin:read", () => {
    expect(ADMIN_ACCESS_SCOPES.read_write).toContain("admin:read");
    expect(ADMIN_ACCESS_SCOPES.read_write).toContain("admin:write");
  });

  it("admin none has no scopes", () => {
    expect(ADMIN_ACCESS_SCOPES.none).toEqual([]);
  });
});
