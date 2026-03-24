import {
  AdminAccessLevelSchema,
  ApiKeyScopeSchema,
  DataAccessLevelSchema,
} from "@eclaire/api-types";
import z from "zod/v4";

export const CreateServiceActorSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const UpdateServiceActorSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const CreateActorApiKeySchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100).optional(),
    scopes: z.array(ApiKeyScopeSchema).optional(),
    dataAccess: DataAccessLevelSchema.optional(),
    adminAccess: AdminAccessLevelSchema.optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (value) => {
      const hasPermissionLevels =
        value.dataAccess !== undefined || value.adminAccess !== undefined;
      const hasScopes = value.scopes !== undefined;
      return !(hasPermissionLevels && hasScopes);
    },
    { message: "Cannot specify both permission levels and scopes" },
  )
  .refine(
    (value) => {
      const hasData = value.dataAccess !== undefined;
      const hasAdmin = value.adminAccess !== undefined;
      return hasData === hasAdmin;
    },
    {
      message: "Both dataAccess and adminAccess must be provided together",
    },
  );

export const UpdateActorApiKeySchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100).optional(),
    scopes: z.array(ApiKeyScopeSchema).optional(),
    dataAccess: DataAccessLevelSchema.optional(),
    adminAccess: AdminAccessLevelSchema.optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.scopes !== undefined ||
      value.dataAccess !== undefined ||
      value.expiresAt !== undefined,
    {
      message: "At least one field must be provided",
    },
  )
  .refine(
    (value) => {
      const hasPermissionLevels =
        value.dataAccess !== undefined || value.adminAccess !== undefined;
      const hasScopes = value.scopes !== undefined;
      return !(hasPermissionLevels && hasScopes);
    },
    { message: "Cannot specify both permission levels and scopes" },
  )
  .refine(
    (value) => {
      const hasData = value.dataAccess !== undefined;
      const hasAdmin = value.adminAccess !== undefined;
      return hasData === hasAdmin;
    },
    {
      message: "Both dataAccess and adminAccess must be provided together",
    },
  );
