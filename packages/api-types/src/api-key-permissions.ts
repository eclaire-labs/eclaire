import z from "zod/v4";
import type { ApiKeyScope } from "./auth.js";

export const DataAccessLevelSchema = z.enum(["read", "read_write"]);
export const AdminAccessLevelSchema = z.enum(["none", "read", "read_write"]);

export type DataAccessLevel = z.infer<typeof DataAccessLevelSchema>;
export type AdminAccessLevel = z.infer<typeof AdminAccessLevelSchema>;

const DATA_READ_SCOPES: ApiKeyScope[] = [
  "profile:read",
  "assets:read",
  "tasks:read",
  "channels:read",
  "agents:read",
  "conversations:read",
  "conversations:invoke",
  "history:read",
  "processing:read",
  "feedback:read",
  "model:read",
  "speech:read",
  "media:read",
];

const DATA_WRITE_SCOPES: ApiKeyScope[] = [
  "profile:write",
  "assets:write",
  "tasks:write",
  "channels:write",
  "agents:write",
  "conversations:write",
  "feedback:write",
  "notifications:write",
  "processing:write",
  "speech:write",
  "media:write",
];

export const DATA_ACCESS_SCOPES: Record<DataAccessLevel, ApiKeyScope[]> = {
  read: DATA_READ_SCOPES,
  read_write: [...DATA_READ_SCOPES, ...DATA_WRITE_SCOPES],
};

export const ADMIN_ACCESS_SCOPES: Record<AdminAccessLevel, ApiKeyScope[]> = {
  none: [],
  read: ["admin:read"],
  read_write: ["admin:read", "admin:write"],
};

export const DATA_ACCESS_INFO: Record<
  DataAccessLevel,
  { label: string; description: string }
> = {
  read: {
    label: "Read only",
    description: "Read all workspace data without making changes.",
  },
  read_write: {
    label: "Read & write",
    description: "Read and modify all workspace data.",
  },
};

export const ADMIN_ACCESS_INFO: Record<
  AdminAccessLevel,
  { label: string; description: string }
> = {
  none: {
    label: "None",
    description: "No access to admin configuration.",
  },
  read: {
    label: "Read only",
    description: "Read admin configuration, providers, models, and users.",
  },
  read_write: {
    label: "Read & write",
    description:
      "Modify admin configuration and manage users, providers, and models.",
  },
};

/**
 * Resolve two permission axes into a flat scope array.
 * Deliberately excludes credentials:* and actors:* from all combinations.
 */
export function resolvePermissionScopes(
  dataAccess: DataAccessLevel,
  adminAccess: AdminAccessLevel,
): ApiKeyScope[] {
  return [
    ...DATA_ACCESS_SCOPES[dataAccess],
    ...ADMIN_ACCESS_SCOPES[adminAccess],
  ];
}

/**
 * Derive permission levels from a scope array, or null for legacy/custom keys.
 * Returns null when the scopes do not exactly match any known combination.
 */
export function derivePermissionLevels(
  scopes: ApiKeyScope[],
): { dataAccess: DataAccessLevel; adminAccess: AdminAccessLevel } | null {
  const scopeSet = new Set(scopes);

  const dataLevels: DataAccessLevel[] = ["read_write", "read"];
  const adminLevels: AdminAccessLevel[] = ["read_write", "read", "none"];

  for (const data of dataLevels) {
    for (const admin of adminLevels) {
      const expected = resolvePermissionScopes(data, admin);
      if (
        expected.length === scopeSet.size &&
        expected.every((s) => scopeSet.has(s))
      ) {
        return { dataAccess: data, adminAccess: admin };
      }
    }
  }

  return null;
}
