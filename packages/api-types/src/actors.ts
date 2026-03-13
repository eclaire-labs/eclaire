import z from "zod/v4";

export const DEFAULT_AGENT_ACTOR_ID = "eclaire" as const;

export const ActorKindSchema = z.enum(["human", "agent", "system", "service"]);

export const ActorSummarySchema = z
  .object({
    id: z.string(),
    kind: ActorKindSchema,
    displayName: z.string().nullable(),
  })
  .meta({ ref: "ActorSummary" });

export type ActorKind = z.infer<typeof ActorKindSchema>;
export type ActorSummary = z.infer<typeof ActorSummarySchema>;
