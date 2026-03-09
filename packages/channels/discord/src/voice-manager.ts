import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  StreamType,
  type VoiceConnection,
  type AudioPlayer,
  type AudioReceiveStream,
} from "@discordjs/voice";
import { Readable } from "node:stream";
import type { Client, VoiceBasedChannel } from "discord.js";
import type { DiscordLogger } from "./deps.js";

interface VoiceSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  guildId: string;
  channelId: string;
}

const activeSessions = new Map<string, VoiceSession>();

/**
 * Joins a voice channel and returns the voice session.
 */
export async function joinChannel(
  client: Client,
  guildId: string,
  voiceChannelId: string,
  logger: DiscordLogger,
): Promise<VoiceSession | null> {
  const existingSession = activeSessions.get(guildId);
  if (existingSession) {
    logger.info(
      { guildId, channelId: voiceChannelId },
      "Already in voice channel",
    );
    return existingSession;
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.error({ guildId }, "Guild not found for voice connection");
      return null;
    }

    const channel = guild.channels.cache.get(voiceChannelId) as
      | VoiceBasedChannel
      | undefined;
    if (!channel || !channel.isVoiceBased()) {
      logger.error(
        { voiceChannelId },
        "Voice channel not found or not voice-based",
      );
      return null;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    // Wait for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    // Handle disconnection
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      logger.warn(
        { guildId, channelId: voiceChannelId },
        "Voice connection disconnected",
      );
      try {
        // Try to reconnect (discord.js/voice handles most reconnects)
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Reconnecting automatically
      } catch {
        // Could not reconnect — destroy
        logger.error(
          { guildId },
          "Voice reconnect failed, destroying connection",
        );
        connection.destroy();
        activeSessions.delete(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      logger.info({ guildId }, "Voice connection destroyed");
      activeSessions.delete(guildId);
    });

    const session: VoiceSession = {
      connection,
      player,
      guildId,
      channelId: voiceChannelId,
    };
    activeSessions.set(guildId, session);

    logger.info(
      { guildId, channelId: voiceChannelId },
      "Joined voice channel successfully",
    );

    return session;
  } catch (error) {
    logger.error(
      {
        guildId,
        voiceChannelId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to join voice channel",
    );
    return null;
  }
}

/**
 * Leaves a voice channel in the specified guild.
 */
export function leaveChannel(guildId: string, logger: DiscordLogger): void {
  const session = activeSessions.get(guildId);
  if (!session) {
    logger.debug({ guildId }, "No active voice session to leave");
    return;
  }

  try {
    session.player.stop();
    session.connection.destroy();
    activeSessions.delete(guildId);
    logger.info({ guildId }, "Left voice channel");
  } catch (error) {
    logger.error(
      {
        guildId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error leaving voice channel",
    );
  }
}

/**
 * Plays audio in the voice channel for the given guild.
 * @param audioBuffer - Audio data (any format FFmpeg can decode, or raw PCM/Opus)
 * @param inputType - The input type hint for createAudioResource (default: "arbitrary")
 */
export async function playAudio(
  guildId: string,
  audioBuffer: Buffer,
  logger: DiscordLogger,
  inputType: "arbitrary" | "ogg/opus" | "webm/opus" = "arbitrary",
): Promise<boolean> {
  const session = activeSessions.get(guildId);
  if (!session) {
    logger.error({ guildId }, "No active voice session for playback");
    return false;
  }

  try {
    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream, {
      inputType:
        inputType === "ogg/opus"
          ? StreamType.OggOpus
          : inputType === "webm/opus"
            ? StreamType.WebmOpus
            : StreamType.Arbitrary,
    });

    session.player.play(resource);
    await entersState(session.player, AudioPlayerStatus.Playing, 5_000);

    logger.info({ guildId }, "Playing audio in voice channel");
    return true;
  } catch (error) {
    logger.error(
      {
        guildId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to play audio in voice channel",
    );
    return false;
  }
}

/**
 * Subscribes to audio from a specific user in the voice channel.
 * Returns a readable stream of Opus packets from the user.
 * The caller is responsible for decoding and processing the audio.
 */
export function listenToUser(
  guildId: string,
  discordUserId: string,
  logger: DiscordLogger,
): AudioReceiveStream | null {
  const session = activeSessions.get(guildId);
  if (!session) {
    logger.error({ guildId }, "No active voice session for listening");
    return null;
  }

  try {
    const receiver = session.connection.receiver;
    const stream = receiver.subscribe(discordUserId, {
      end: { behavior: 1 /* EndBehaviorType.AfterSilence */, duration: 1000 },
    });

    logger.debug({ guildId, discordUserId }, "Subscribed to user audio stream");
    return stream;
  } catch (error) {
    logger.error(
      {
        guildId,
        discordUserId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to subscribe to user audio",
    );
    return null;
  }
}

/**
 * Leaves all voice channels (for graceful shutdown).
 */
export function leaveAllChannels(logger: DiscordLogger): void {
  for (const [guildId] of activeSessions) {
    leaveChannel(guildId, logger);
  }
  logger.info("Left all voice channels");
}

/**
 * Returns whether there's an active voice session for a guild.
 */
export function hasActiveSession(guildId: string): boolean {
  return activeSessions.has(guildId);
}
