import z from "zod/v4";
import { ActorSummarySchema } from "./actors.js";

export const ApiKeyScopeSchema = z.enum([
  "*",
  "profile:read",
  "profile:write",
  "credentials:read",
  "credentials:write",
  "actors:read",
  "actors:write",
  "assets:read",
  "assets:write",
  "tasks:read",
  "tasks:write",
  "channels:read",
  "channels:write",
  "agents:read",
  "agents:write",
  "conversations:read",
  "conversations:write",
  "history:read",
  "processing:read",
  "processing:write",
  "notifications:write",
  "feedback:read",
  "feedback:write",
  "model:read",
  "admin:read",
  "admin:write",
  "audio:read",
  "audio:write",
]);

export const ApiKeyScopeCatalogItemSchema = z
  .object({
    scope: ApiKeyScopeSchema,
    label: z.string(),
    description: z.string(),
  })
  .meta({ ref: "ApiKeyScopeCatalogItem" });

export const ActorApiKeySchema = z
  .object({
    id: z.string(),
    actor: ActorSummarySchema,
    grantId: z.string(),
    displayKey: z.string(),
    name: z.string(),
    scopes: z.array(ApiKeyScopeSchema),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    isActive: z.boolean(),
  })
  .meta({ ref: "ActorApiKey" });

export const CreatedActorApiKeySchema = ActorApiKeySchema.extend({
  key: z.string(),
}).meta({ ref: "CreatedActorApiKey" });

export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;
export type ApiKeyScopeCatalogItem = z.infer<
  typeof ApiKeyScopeCatalogItemSchema
>;
export type ActorApiKey = z.infer<typeof ActorApiKeySchema>;
export type CreatedActorApiKey = z.infer<typeof CreatedActorApiKeySchema>;
