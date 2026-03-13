import z from "zod/v4";

export const AgentPayloadSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(240).optional().nullable(),
  systemPrompt: z.string().min(1).max(12000),
  toolNames: z.array(z.string()).optional(),
  skillNames: z.array(z.string()).optional(),
});

export const CreateAgentSchema = AgentPayloadSchema;

export const UpdateAgentSchema = AgentPayloadSchema.partial();

export type CreateAgentRequest = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentRequest = z.infer<typeof UpdateAgentSchema>;
