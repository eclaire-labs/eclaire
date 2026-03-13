import { ApiKeyScopeSchema } from "@eclaire/api-types";
import z from "zod/v4";

export const CreateServiceActorSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const UpdateServiceActorSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const CreateActorApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  scopes: z.array(ApiKeyScopeSchema).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const UpdateActorApiKeySchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100).optional(),
    scopes: z.array(ApiKeyScopeSchema).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.scopes !== undefined ||
      value.expiresAt !== undefined,
    {
      message: "At least one field must be provided",
    },
  );
