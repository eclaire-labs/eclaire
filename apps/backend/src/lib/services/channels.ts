import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

const { channels } = schema;

import type {
  ChannelPlatform,
  CreateChannelRequest,
  UpdateChannelRequest,
} from "../../schemas/channels-params.js";
import type {
  ChannelResponse,
  CreateChannelResponse,
  DeleteChannelResponse,
  ListChannelsResponse,
  UpdateChannelResponse,
} from "../../schemas/channels-responses.js";
import { channelRegistry } from "../channels.js";
import { formatRequiredTimestamp } from "@eclaire/core";
import { NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";

const logger = createChildLogger("channels");

/**
 * Validates and encrypts platform-specific config via the channel adapter.
 */
async function validateAndEncryptConfig(
  platform: ChannelPlatform,
  config: unknown,
): Promise<Record<string, unknown> | null> {
  try {
    const adapter = channelRegistry.get(platform);
    return await adapter.validateAndEncryptConfig(config);
  } catch (error) {
    logger.error(
      {
        platform,
        error:
          error instanceof Error
            ? error.message
            : JSON.stringify(error, null, 2),
      },
      "Failed to validate/encrypt config",
    );
    return null;
  }
}

/**
 * Formats a channel for API response (excludes sensitive config)
 */
// biome-ignore lint/suspicious/noExplicitAny: raw DB row
function formatChannelForResponse(channel: any): ChannelResponse {
  return {
    id: channel.id,
    userId: channel.userId,
    name: channel.name,
    platform: channel.platform,
    capability: channel.capability,
    isActive: channel.isActive,
    createdAt: formatRequiredTimestamp(channel.createdAt),
    updatedAt: formatRequiredTimestamp(channel.updatedAt),
  };
}

/**
 * Get all channels for a user
 */
export async function getUserChannels(
  userId: string,
): Promise<ListChannelsResponse> {
  try {
    const userChannels = await db.query.channels.findMany({
      where: eq(channels.userId, userId),
      orderBy: (channels, { desc }) => [desc(channels.createdAt)],
    });

    const formattedChannels = userChannels.map(formatChannelForResponse);

    return {
      items: formattedChannels,
      totalCount: formattedChannels.length,
      limit: formattedChannels.length,
      offset: 0,
    };
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error fetching user channels",
    );
    throw new Error("Failed to fetch channels");
  }
}

/**
 * Create a new channel
 */
export async function createChannel(
  userId: string,
  channelData: CreateChannelRequest,
): Promise<CreateChannelResponse> {
  try {
    // Validate and encrypt the platform-specific config
    const encryptedConfig = await validateAndEncryptConfig(
      channelData.platform,
      channelData.config,
    );
    if (!encryptedConfig) {
      throw new Error("Invalid configuration for platform");
    }

    // Create the channel
    const [newChannel] = await db
      .insert(channels)
      .values({
        userId,
        name: channelData.name,
        platform: channelData.platform,
        capability: channelData.capability,
        config: encryptedConfig,
        isActive: true,
      })
      .returning();

    if (!newChannel) {
      throw new Error("Failed to create channel");
    }

    // Record history
    await recordHistory({
      action: "create",
      itemType: "channel",
      itemId: newChannel.id,
      itemName: channelData.name,
      afterData: {
        ...formatChannelForResponse(newChannel),
        platform: channelData.platform,
        capability: channelData.capability,
      },
      actor: "user",
      userId: userId,
    });

    // Start channel runtime if the adapter supports it
    const adapter = channelRegistry.get(channelData.platform);
    if (adapter.start) {
      try {
        await adapter.start(newChannel);
      } catch (startError) {
        logger.warn(
          { channelId: newChannel.id },
          "Failed to start channel after creation",
        );
      }
    }

    logger.info(
      {
        channelId: newChannel.id,
        userId,
        platform: channelData.platform,
      },
      "Channel created successfully",
    );

    return {
      channel: formatChannelForResponse(newChannel),
      message: "Channel created successfully",
    };
  } catch (error) {
    logger.error(
      {
        userId,
        channelData,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error creating channel",
    );

    if (
      error instanceof Error &&
      error.message === "Invalid configuration for platform"
    ) {
      throw error;
    }

    throw new Error("Failed to create channel");
  }
}

/**
 * Update an existing channel
 */
export async function updateChannel(
  channelId: string,
  userId: string,
  updateData: UpdateChannelRequest,
): Promise<UpdateChannelResponse> {
  try {
    // Get existing channel
    const existingChannel = await db.query.channels.findFirst({
      where: and(eq(channels.id, channelId), eq(channels.userId, userId)),
    });

    if (!existingChannel) {
      throw new NotFoundError("Channel");
    }

    // Prepare update object
    // biome-ignore lint/suspicious/noExplicitAny: dynamic update object
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (updateData.name !== undefined) {
      updateValues.name = updateData.name;
    }

    if (updateData.capability !== undefined) {
      updateValues.capability = updateData.capability;
    }

    if (updateData.isActive !== undefined) {
      updateValues.isActive = updateData.isActive;
    }

    if (updateData.config !== undefined) {
      // Validate and encrypt the new config
      const encryptedConfig = await validateAndEncryptConfig(
        existingChannel.platform,
        updateData.config,
      );
      if (!encryptedConfig) {
        throw new Error("Invalid configuration for platform");
      }
      updateValues.config = encryptedConfig;
    }

    // Update the channel
    const [updatedChannel] = await db
      .update(channels)
      .set(updateValues)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .returning();

    if (!updatedChannel) {
      throw new NotFoundError("Channel");
    }

    // Record history
    await recordHistory({
      action: "update",
      itemType: "channel",
      itemId: channelId,
      itemName: updatedChannel.name,
      beforeData: formatChannelForResponse(existingChannel),
      afterData: formatChannelForResponse(updatedChannel),
      actor: "user",
      userId: userId,
    });

    // Handle channel runtime restart if config or active status changed
    if (updateData.config !== undefined || updateData.isActive !== undefined) {
      const adapter = channelRegistry.get(existingChannel.platform);
      if (adapter.stop) {
        await adapter.stop(channelId);
      }
      if (updatedChannel.isActive && adapter.start) {
        try {
          await adapter.start(updatedChannel);
        } catch (startError) {
          logger.warn(
            { channelId },
            "Failed to restart channel after update",
          );
        }
      }
    }

    logger.info(
      {
        channelId,
        userId,
      },
      "Channel updated successfully",
    );

    return {
      channel: formatChannelForResponse(updatedChannel),
      message: "Channel updated successfully",
    };
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        updateData,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error updating channel",
    );

    if (
      error instanceof Error &&
      (error.message === "Channel not found" ||
        error.message === "Invalid configuration for platform")
    ) {
      throw error;
    }

    throw new Error("Failed to update channel");
  }
}

/**
 * Delete a channel
 */
export async function deleteChannel(
  channelId: string,
  userId: string,
): Promise<DeleteChannelResponse> {
  try {
    // Get existing channel for history
    const existingChannel = await db.query.channels.findFirst({
      where: and(eq(channels.id, channelId), eq(channels.userId, userId)),
    });

    if (!existingChannel) {
      throw new NotFoundError("Channel");
    }

    // Stop channel runtime if the adapter supports it
    if (channelRegistry.has(existingChannel.platform)) {
      const adapter = channelRegistry.get(existingChannel.platform);
      if (adapter.stop) {
        await adapter.stop(channelId);
      }
    }

    // Delete the channel
    const deletedRows = await db
      .delete(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .returning();

    if (!deletedRows.length) {
      throw new NotFoundError("Channel");
    }

    // Record history
    await recordHistory({
      action: "delete",
      itemType: "channel",
      itemId: channelId,
      itemName: existingChannel.name,
      beforeData: formatChannelForResponse(existingChannel),
      actor: "user",
      userId: userId,
    });

    logger.info(
      {
        channelId,
        userId,
        platform: existingChannel.platform,
      },
      "Channel deleted successfully",
    );

    return {
      success: true,
      message: "Channel deleted successfully",
    };
  } catch (error) {
    logger.error(
      {
        channelId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error deleting channel",
    );

    if (error instanceof Error && error.message === "Channel not found") {
      throw error;
    }

    throw new Error("Failed to delete channel");
  }
}

/**
 * Get channels by capability for sending notifications
 */
export async function getNotificationChannels(
  userId: string,
  targetChannelIds?: string[],
  // biome-ignore lint/suspicious/noExplicitAny: raw DB row
): Promise<any[]> {
  try {
    const { inArray, or } = await import("drizzle-orm");

    // biome-ignore lint/suspicious/noExplicitAny: dynamic query object
    const whereConditions: any[] = [
      eq(channels.userId, userId),
      channels.isActive,
    ];

    // If specific channels are requested
    if (targetChannelIds && targetChannelIds.length > 0) {
      whereConditions.push(inArray(channels.id, targetChannelIds));
    } else {
      // Get all notification-capable channels
      whereConditions.push(
        or(
          eq(channels.capability, "notification"),
          eq(channels.capability, "bidirectional"),
        ),
      );
    }

    const notificationChannels = await db.query.channels.findMany({
      where: and(...whereConditions),
    });

    return notificationChannels;
  } catch (error) {
    logger.error(
      {
        userId,
        targetChannelIds,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error fetching notification channels",
    );
    throw new Error("Failed to fetch notification channels");
  }
}
