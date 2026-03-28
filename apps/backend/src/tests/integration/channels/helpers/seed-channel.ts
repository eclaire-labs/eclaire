/**
 * Test data factories for seeding channels and agents into the test database.
 */
import type {
  ChannelCapability,
  ChannelPlatform,
} from "@eclaire/channels-core";
import { generateChannelId } from "@eclaire/core/id";
import type { TestDatabase } from "../../../db/setup.js";
import { createTestUser } from "../../../db/setup.js";

export interface SeedChannelOptions {
  userId?: string;
  channelId?: string;
  platform?: ChannelPlatform;
  capability?: ChannelCapability;
  isActive?: boolean;
  agentActorId?: string | null;
  config?: Record<string, unknown>;
  name?: string;
}

export async function seedChannel(
  testDb: TestDatabase,
  overrides: SeedChannelOptions = {},
) {
  const { db, schema } = testDb;

  // Create user if userId not provided
  let userId = overrides.userId;
  if (!userId) {
    const user = await createTestUser(testDb);
    userId = user.id;
  }

  const channelId = overrides.channelId ?? generateChannelId();
  const platform = overrides.platform ?? "telegram";

  await db.insert(schema.channels).values({
    id: channelId,
    userId,
    name: overrides.name ?? `Test ${platform} Channel`,
    platform,
    capability: overrides.capability ?? "bidirectional",
    config: overrides.config ?? {},
    isActive: overrides.isActive ?? true,
    agentActorId: overrides.agentActorId ?? null,
  });

  const channel = await db.query.channels.findFirst({
    where: (c, { eq }) => eq(c.id, channelId),
  });

  return { userId, channelId, channel: channel! };
}

export interface SeedAgentOptions {
  agentId?: string;
  name?: string;
  systemPrompt?: string;
}

export async function seedAgent(
  testDb: TestDatabase,
  userId: string,
  overrides: SeedAgentOptions = {},
) {
  const { db, schema } = testDb;

  const name = overrides.name ?? "Research Bot";

  const [row] = await db
    .insert(schema.agents)
    .values({
      id: overrides.agentId,
      userId,
      name,
      systemPrompt: overrides.systemPrompt ?? "You are a research assistant.",
    })
    .returning({ id: schema.agents.id });

  return { agentId: row!.id, name };
}
