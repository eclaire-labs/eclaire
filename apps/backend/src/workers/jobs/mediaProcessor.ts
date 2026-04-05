import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { type AIMessage, callAI } from "@eclaire/ai";
import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";
import { isAudioAvailable, transcribe } from "../../lib/services/audio.js";
import { buildKey, getStorage } from "../../lib/storage/index.js";
import { config } from "../config.js";
import { directDownload } from "../lib/direct-download.js";
import {
  type YtdlpSubtitleResult,
  downloadMedia as ytdlpDownload,
  extractSubtitles,
  fetchMediaInfo,
  isYtdlpAvailable,
} from "../lib/ytdlp.js";

const logger = createChildLogger("media-processor");

export interface MediaJobData {
  mediaId: string;
  userId: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
  sourceUrl?: string;
}

const MAX_MEDIA_SIZE = 500 * 1024 * 1024; // 500 MB

const STAGES = {
  URL_DOWNLOAD: "url_download",
  PREPARATION: "media_preparation",
  METADATA_EXTRACTION: "metadata_extraction",
  WAVEFORM_GENERATION: "waveform_generation", // also used for video thumbnail
  TRANSCRIPTION: "transcription",
  AI_ANALYSIS: "ai_analysis",
  FINALIZATION: "finalization",
} as const;

type Stage = (typeof STAGES)[keyof typeof STAGES];

// --- FFmpeg/FFprobe helpers (availability cached for process lifetime) ---

let cachedFFmpeg: boolean | null = null;
let cachedFFprobe: boolean | null = null;

async function isFFmpegAvailable(): Promise<boolean> {
  if (cachedFFmpeg !== null) return cachedFFmpeg;
  cachedFFmpeg = await new Promise<boolean>((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
  return cachedFFmpeg;
}

async function isFFprobeAvailable(): Promise<boolean> {
  if (cachedFFprobe !== null) return cachedFFprobe;
  cachedFFprobe = await new Promise<boolean>((resolve) => {
    const proc = spawn("ffprobe", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
  return cachedFFprobe;
}

interface AudioMetadata {
  duration?: number;
  channels?: number;
  sampleRate?: number;
  bitrate?: number;
  codec?: string;
}

interface VideoMetadata extends AudioMetadata {
  width?: number;
  height?: number;
  frameRate?: number;
  videoCodec?: string;
}

async function extractAudioMetadata(
  audioBuffer: Buffer,
): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-i",
        "pipe:0",
        "-show_entries",
        "format=duration,bit_rate:stream=channels,sample_rate,codec_name",
        "-v",
        "quiet",
        "-of",
        "json",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}`));
        return;
      }
      try {
        const data = JSON.parse(output);
        const format = data.format || {};
        const stream = data.streams?.[0] || {};
        resolve({
          duration: format.duration
            ? Number.parseFloat(format.duration)
            : undefined,
          channels: stream.channels || undefined,
          sampleRate: stream.sample_rate
            ? Number.parseInt(stream.sample_rate, 10)
            : undefined,
          bitrate: format.bit_rate
            ? Number.parseInt(format.bit_rate, 10)
            : undefined,
          codec: stream.codec_name || undefined,
        });
      } catch {
        reject(new Error("Failed to parse FFprobe output"));
      }
    });
    proc.on("error", (err) => reject(err));

    const inputStream = Readable.from(audioBuffer);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

async function extractVideoMetadata(
  videoBuffer: Buffer,
): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-i",
        "pipe:0",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_name,width,height,r_frame_rate,channels,sample_rate,codec_type",
        "-v",
        "quiet",
        "-of",
        "json",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}`));
        return;
      }
      try {
        const data = JSON.parse(output);
        const format = data.format || {};
        const streams = data.streams || [];

        const videoStream = streams.find(
          // biome-ignore lint/suspicious/noExplicitAny: ffprobe stream output is untyped
          (s: any) => s.codec_type === "video",
        );
        const audioStream = streams.find(
          // biome-ignore lint/suspicious/noExplicitAny: ffprobe stream output is untyped
          (s: any) => s.codec_type === "audio",
        );

        let frameRate: number | undefined;
        if (videoStream?.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
          if (num && den) {
            frameRate = Math.round((num / den) * 100) / 100;
          }
        }

        resolve({
          duration: format.duration
            ? Number.parseFloat(format.duration)
            : undefined,
          bitrate: format.bit_rate
            ? Number.parseInt(format.bit_rate, 10)
            : undefined,
          // Video stream
          width: videoStream?.width || undefined,
          height: videoStream?.height || undefined,
          frameRate,
          videoCodec: videoStream?.codec_name || undefined,
          // Audio stream
          channels: audioStream?.channels || undefined,
          sampleRate: audioStream?.sample_rate
            ? Number.parseInt(audioStream.sample_rate, 10)
            : undefined,
          codec: audioStream?.codec_name || undefined,
        });
      } catch {
        reject(new Error("Failed to parse FFprobe output"));
      }
    });
    proc.on("error", (err) => reject(err));

    const inputStream = Readable.from(videoBuffer);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

async function generateWaveform(audioBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-i",
        "pipe:0",
        "-filter_complex",
        "showwavespic=s=800x200:colors=#3b82f6",
        "-frames:v",
        "1",
        "-f",
        "image2",
        "-c:v",
        "png",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg waveform exited with code ${code}`));
      }
    });
    proc.on("error", (err) => reject(err));

    const inputStream = Readable.from(audioBuffer);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

async function generateThumbnail(
  videoBuffer: Buffer,
  seekSeconds = 3,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-ss",
        String(seekSeconds),
        "-i",
        "pipe:0",
        "-vframes",
        "1",
        "-an",
        "-f",
        "image2",
        "-c:v",
        "png",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg thumbnail exited with code ${code}`));
      }
    });
    proc.on("error", (err) => reject(err));

    const inputStream = Readable.from(videoBuffer);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

// --- AI helpers ---

function parseModelResponse(
  // biome-ignore lint/suspicious/noExplicitAny: AI model response can be string or pre-parsed object
  responseText: string | any,
  // biome-ignore lint/suspicious/noExplicitAny: AI model returns dynamic JSON output
): any {
  try {
    if (typeof responseText === "object" && responseText !== null) {
      if (
        "content" in responseText &&
        typeof responseText.content === "string"
      ) {
        const content = responseText.content;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        const cleaned = (jsonMatch?.[1] || content).trim();
        if (!cleaned.startsWith("[") && !cleaned.startsWith("{")) {
          throw new Error("Content does not appear to be JSON");
        }
        return JSON.parse(cleaned);
      }
      return responseText;
    }
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    const cleaned = (jsonMatch?.[1] || responseText).trim();
    if (!cleaned.startsWith("[") && !cleaned.startsWith("{")) {
      throw new Error("Content does not appear to be JSON");
    }
    return JSON.parse(cleaned);
  } catch (error: unknown) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to parse AI response as JSON",
    );
    throw new Error(
      `Could not parse AI response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function generateMediaContentMarkdown(
  // biome-ignore lint/suspicious/noExplicitAny: extractedData contains dynamic AI analysis results
  extractedData: Record<string, any>,
): string {
  const sections: string[] = [];

  const category = extractedData.aiAnalysis?.category || "media";
  sections.push(`# ${category.charAt(0).toUpperCase() + category.slice(1)}`);

  if (extractedData.aiAnalysis?.description) {
    sections.push(`\n${extractedData.aiAnalysis.description}`);
  }

  // Metadata
  const meta = extractedData.metadata;
  if (meta) {
    const lines: string[] = [];
    if (meta.duration)
      lines.push(`- **Duration:** ${formatDuration(meta.duration)}`);

    // Video-specific
    if (meta.width && meta.height)
      lines.push(`- **Resolution:** ${meta.width}x${meta.height}`);
    if (meta.frameRate) lines.push(`- **Frame Rate:** ${meta.frameRate} fps`);
    if (meta.videoCodec) lines.push(`- **Video Codec:** ${meta.videoCodec}`);

    // Audio track info
    if (meta.codec) lines.push(`- **Audio Codec:** ${meta.codec}`);
    if (meta.sampleRate) lines.push(`- **Sample Rate:** ${meta.sampleRate} Hz`);
    if (meta.channels)
      lines.push(
        `- **Channels:** ${meta.channels === 1 ? "Mono" : meta.channels === 2 ? "Stereo" : meta.channels}`,
      );
    if (meta.bitrate)
      lines.push(`- **Bitrate:** ${Math.round(meta.bitrate / 1000)} kbps`);

    if (lines.length > 0) {
      const heading = meta.width ? "Video Info" : "Audio Info";
      sections.push(`\n## ${heading}\n\n${lines.join("\n")}`);
    }
  }

  // Transcript
  if (extractedData.transcript) {
    sections.push(`\n## Transcript\n\n${extractedData.transcript}`);
  }

  // Tags
  if (extractedData.processedTags?.length) {
    sections.push(`\n## Tags\n\n${extractedData.processedTags.join(", ")}`);
  }

  return sections.join("\n");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Embedded subtitle extraction via ffmpeg ---

interface EmbeddedSubtitleResult {
  text: string;
  language: string | undefined;
}

async function extractEmbeddedSubtitles(
  mediaBuffer: Buffer,
): Promise<EmbeddedSubtitleResult | null> {
  // First, check if there are subtitle streams using ffprobe
  const hasSubtitles = await new Promise<boolean>((resolve) => {
    let resolved = false;
    const resolveOnce = (value: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    const proc = spawn(
      "ffprobe",
      [
        "-i",
        "pipe:0",
        "-show_entries",
        "stream=codec_type,codec_name",
        "-select_streams",
        "s",
        "-v",
        "quiet",
        "-of",
        "json",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolveOnce(false);
        return;
      }
      try {
        const data = JSON.parse(output);
        resolveOnce(data.streams && data.streams.length > 0);
      } catch {
        resolveOnce(false);
      }
    });
    proc.on("error", () => resolveOnce(false));

    const inputStream = Readable.from(mediaBuffer);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });

  if (!hasSubtitles) return null;

  // Extract the first subtitle stream as SRT
  return new Promise((resolve) => {
    let resolved = false;
    const resolveOnce = (value: EmbeddedSubtitleResult | null) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    const proc = spawn(
      "ffmpeg",
      ["-i", "pipe:0", "-map", "0:s:0", "-f", "srt", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolveOnce(null);
        return;
      }
      const srtContent = Buffer.concat(chunks).toString("utf-8");
      // Parse SRT: strip sequence numbers, timestamps, and blank lines
      const text = srtContent
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          if (/^\d+$/.test(trimmed)) return false; // sequence number
          if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(trimmed)) return false; // timestamp
          return true;
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) {
        resolveOnce(null);
        return;
      }
      resolveOnce({ text, language: undefined });
    });
    proc.on("error", () => resolveOnce(null));

    const inputStream = Readable.from(mediaBuffer);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

// --- DB update helper for URL imports ---

async function updateMediaRecordAfterDownload(
  mediaId: string,
  updates: {
    storageId: string;
    mimeType: string;
    fileSize: number;
    mediaType: "audio" | "video";
    originalFilename: string;
    title?: string;
  },
): Promise<void> {
  const { db, schema } = await import("../../db/index.js");
  const { eq } = await import("drizzle-orm");

  // Only update title if the current title looks like a URL-derived placeholder
  const [existing] = await db
    .select({ title: schema.media.title })
    .from(schema.media)
    .where(eq(schema.media.id, mediaId));

  const shouldUpdateTitle =
    updates.title &&
    existing &&
    (existing.title.includes("/") || existing.title.includes("://"));

  await db
    .update(schema.media)
    .set({
      storageId: updates.storageId,
      mimeType: updates.mimeType,
      fileSize: updates.fileSize,
      mediaType: updates.mediaType,
      originalFilename: updates.originalFilename,
      ...(shouldUpdateTitle ? { title: updates.title } : {}),
    })
    .where(eq(schema.media.id, mediaId));
}

// --- Main processor ---

async function processMediaJob(ctx: JobContext<MediaJobData>): Promise<void> {
  const {
    mediaId,
    userId,
    sourceUrl,
    storageId: jobStorageId,
    mimeType: jobMimeType,
    originalFilename: jobOriginalFilename,
  } = ctx.job.data;

  logger.info(
    {
      mediaId,
      jobId: ctx.job.id,
      userId,
      mimeType: jobMimeType,
      storageId: jobStorageId,
      sourceUrl,
    },
    "Starting media processing job",
  );

  if (!mediaId || !userId) {
    throw new Error(
      `Missing required job data: mediaId=${mediaId}, userId=${userId}`,
    );
  }

  const isUrlImport = !!sourceUrl;

  // For file uploads, storageId is required
  if (!isUrlImport) {
    if (!jobStorageId || jobStorageId.trim() === "") {
      throw new Error(
        `Invalid or missing storageId for media ${mediaId}. Received: ${jobStorageId}`,
      );
    }
  }

  // Mutable state: these will be set by URL_DOWNLOAD for URL imports,
  // or come directly from job data for file uploads
  let effectiveStorageId = jobStorageId || "";
  let effectiveMimeType = jobMimeType || "";
  let effectiveOriginalFilename = jobOriginalFilename;
  let preExtractedSubtitles: YtdlpSubtitleResult | null = null;
  let sourceTitle: string | undefined;
  let sourceDescription: string | undefined;

  const isVideo = () => effectiveMimeType.startsWith("video/");

  // Build stage list dynamically
  const allStages: Stage[] = [
    ...(isUrlImport ? [STAGES.URL_DOWNLOAD] : []),
    STAGES.PREPARATION,
    STAGES.METADATA_EXTRACTION,
    STAGES.WAVEFORM_GENERATION,
    STAGES.TRANSCRIPTION,
    STAGES.AI_ANALYSIS,
    STAGES.FINALIZATION,
  ];

  await ctx.initStages(allStages);

  // biome-ignore lint/suspicious/noExplicitAny: parsed AI model output
  const allArtifacts: Record<string, any> = {};
  // biome-ignore lint/suspicious/noExplicitAny: parsed AI model output
  const extractedData: Record<string, any> = {
    mediaId,
    mimeType: effectiveMimeType,
    originalFilename: effectiveOriginalFilename,
    processedAt: new Date().toISOString(),
    aiAnalysis: {},
  };

  try {
    // --- URL DOWNLOAD (only for URL imports) ---
    if (isUrlImport) {
      await ctx.startStage(STAGES.URL_DOWNLOAD);
      const tempDir = join(tmpdir(), `eclaire-media-${mediaId}`);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(tempDir, { recursive: true });

      try {
        if (await isYtdlpAvailable()) {
          logger.info({ mediaId, sourceUrl }, "Using yt-dlp for URL download");

          // Fetch metadata first (cache for title update later)
          await ctx.updateStageProgress(STAGES.URL_DOWNLOAD, 10);
          let ytdlpInfo: Awaited<ReturnType<typeof fetchMediaInfo>> | null =
            null;
          try {
            ytdlpInfo = await fetchMediaInfo(sourceUrl);
            if (
              ytdlpInfo.estimatedFileSize &&
              ytdlpInfo.estimatedFileSize > MAX_MEDIA_SIZE
            ) {
              throw new Error(
                `Estimated file size ${Math.round(ytdlpInfo.estimatedFileSize / 1024 / 1024)}MB exceeds 500MB limit`,
              );
            }
            sourceTitle = ytdlpInfo.title;
            sourceDescription = ytdlpInfo.description ?? undefined;
            logger.info(
              {
                mediaId,
                title: ytdlpInfo.title,
                duration: ytdlpInfo.duration,
                mediaType: ytdlpInfo.mediaType,
              },
              "yt-dlp metadata fetched",
            );
          } catch (metaError) {
            logger.warn(
              {
                mediaId,
                error:
                  metaError instanceof Error
                    ? metaError.message
                    : String(metaError),
              },
              "yt-dlp metadata fetch failed, continuing with download",
            );
          }

          // Download media
          await ctx.updateStageProgress(STAGES.URL_DOWNLOAD, 30);
          const downloadResult = await ytdlpDownload(sourceUrl, tempDir, {
            maxFileSize: MAX_MEDIA_SIZE,
          });
          effectiveMimeType = downloadResult.mimeType;
          effectiveOriginalFilename = downloadResult.filename;

          // Extract subtitles
          await ctx.updateStageProgress(STAGES.URL_DOWNLOAD, 80);
          try {
            preExtractedSubtitles = await extractSubtitles(sourceUrl, tempDir);
            if (preExtractedSubtitles) {
              logger.info(
                {
                  mediaId,
                  language: preExtractedSubtitles.language,
                  source: preExtractedSubtitles.source,
                },
                "Subtitles extracted via yt-dlp",
              );
            }
          } catch (subError) {
            logger.warn(
              {
                mediaId,
                error:
                  subError instanceof Error
                    ? subError.message
                    : String(subError),
              },
              "Subtitle extraction failed, will fall back to STT",
            );
          }

          // Store downloaded file
          const fileContent = await readFile(downloadResult.filePath);
          const storage = getStorage();
          const ext =
            downloadResult.filename.split(".").pop()?.toLowerCase() || "mp4";
          const storageKey = buildKey(
            userId,
            "media",
            mediaId,
            `original.${ext}`,
          );
          await storage.writeBuffer(storageKey, fileContent, {
            contentType: downloadResult.mimeType,
          });
          effectiveStorageId = storageKey;

          // Update DB record with download results and yt-dlp metadata
          await updateMediaRecordAfterDownload(mediaId, {
            storageId: storageKey,
            mimeType: downloadResult.mimeType,
            fileSize: downloadResult.fileSize,
            mediaType: downloadResult.mimeType.startsWith("audio/")
              ? "audio"
              : "video",
            originalFilename: downloadResult.filename,
            title: ytdlpInfo?.title,
          });
        } else {
          // Fallback: direct HTTP download
          logger.info(
            { mediaId, sourceUrl },
            "yt-dlp not available, using direct HTTP download",
          );
          await ctx.updateStageProgress(STAGES.URL_DOWNLOAD, 20);

          const downloadResult = await directDownload(sourceUrl, tempDir, {
            maxFileSize: MAX_MEDIA_SIZE,
          });
          effectiveMimeType = downloadResult.mimeType;
          effectiveOriginalFilename = downloadResult.filename;

          // Store downloaded file
          const fileContent = await readFile(downloadResult.filePath);
          const storage = getStorage();
          const ext =
            downloadResult.filename.split(".").pop()?.toLowerCase() || "mp4";
          const storageKey = buildKey(
            userId,
            "media",
            mediaId,
            `original.${ext}`,
          );
          await storage.writeBuffer(storageKey, fileContent, {
            contentType: downloadResult.mimeType,
          });
          effectiveStorageId = storageKey;

          // Update DB record
          await updateMediaRecordAfterDownload(mediaId, {
            storageId: storageKey,
            mimeType: downloadResult.mimeType,
            fileSize: downloadResult.fileSize,
            mediaType: downloadResult.mimeType.startsWith("audio/")
              ? "audio"
              : "video",
            originalFilename: downloadResult.filename,
          });
        }
      } finally {
        // Clean up temp dir
        await rm(tempDir, { recursive: true, force: true }).catch((err) =>
          logger.warn(
            { tempDir, error: err.message },
            "Failed to clean up temp dir",
          ),
        );
      }

      // Update extracted data with actual values
      extractedData.mimeType = effectiveMimeType;
      extractedData.originalFilename = effectiveOriginalFilename;
      extractedData.sourceUrl = sourceUrl;
      extractedData.sourceTitle = sourceTitle;
      extractedData.sourceDescription = sourceDescription;

      await ctx.completeStage(STAGES.URL_DOWNLOAD);
    }

    // --- PREPARATION ---
    await ctx.startStage(STAGES.PREPARATION);
    const storage = getStorage();

    const meta = await storage.head(effectiveStorageId);
    if (meta && meta.size > MAX_MEDIA_SIZE) {
      throw new Error(
        `Media too large: ${meta.size} bytes exceeds ${MAX_MEDIA_SIZE} byte limit`,
      );
    }

    const { buffer: mediaBuffer } =
      await storage.readBuffer(effectiveStorageId);
    if (mediaBuffer.length === 0)
      throw new Error("Fetched media file is empty.");
    await ctx.completeStage(STAGES.PREPARATION);

    // --- METADATA EXTRACTION ---
    await ctx.startStage(STAGES.METADATA_EXTRACTION);
    try {
      if (await isFFprobeAvailable()) {
        await ctx.updateStageProgress(STAGES.METADATA_EXTRACTION, 30);
        if (isVideo()) {
          const videoMeta = await extractVideoMetadata(mediaBuffer);
          Object.assign(allArtifacts, {
            duration: videoMeta.duration,
            channels: videoMeta.channels,
            sampleRate: videoMeta.sampleRate,
            bitrate: videoMeta.bitrate,
            codec: videoMeta.codec,
            width: videoMeta.width,
            height: videoMeta.height,
            frameRate: videoMeta.frameRate,
            videoCodec: videoMeta.videoCodec,
          });
          extractedData.metadata = videoMeta;
          logger.info({ mediaId, ...videoMeta }, "Video metadata extracted");
        } else {
          const audioMeta = await extractAudioMetadata(mediaBuffer);
          Object.assign(allArtifacts, {
            duration: audioMeta.duration,
            channels: audioMeta.channels,
            sampleRate: audioMeta.sampleRate,
            bitrate: audioMeta.bitrate,
            codec: audioMeta.codec,
          });
          extractedData.metadata = audioMeta;
          logger.info({ mediaId, ...audioMeta }, "Audio metadata extracted");
        }
      } else {
        logger.warn(
          { mediaId },
          "FFprobe not available, skipping metadata extraction",
        );
      }
    } catch (error) {
      logger.warn(
        {
          mediaId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Metadata extraction failed, continuing",
      );
    }
    await ctx.completeStage(STAGES.METADATA_EXTRACTION, allArtifacts);

    // --- WAVEFORM / THUMBNAIL GENERATION ---
    await ctx.startStage(STAGES.WAVEFORM_GENERATION);
    try {
      if (await isFFmpegAvailable()) {
        await ctx.updateStageProgress(STAGES.WAVEFORM_GENERATION, 30);
        if (isVideo()) {
          const duration = allArtifacts.duration as number | undefined;
          const seekSeconds = duration && duration < 3 ? duration * 0.5 : 3;
          const thumbnailBuffer = await generateThumbnail(
            mediaBuffer,
            seekSeconds,
          );
          const thumbnailKey = buildKey(
            userId,
            "media",
            mediaId,
            "thumbnail.png",
          );
          await storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
            contentType: "image/png",
          });
          allArtifacts.thumbnailStorageId = thumbnailKey;
          extractedData.thumbnail = { storageId: thumbnailKey };
          logger.info(
            { mediaId, storageId: thumbnailKey },
            "Video thumbnail generated",
          );
        } else {
          const waveformBuffer = await generateWaveform(mediaBuffer);
          const waveformKey = buildKey(
            userId,
            "media",
            mediaId,
            "waveform.png",
          );
          await storage.writeBuffer(waveformKey, waveformBuffer, {
            contentType: "image/png",
          });
          allArtifacts.thumbnailStorageId = waveformKey;
          allArtifacts.waveformStorageId = waveformKey;
          extractedData.waveform = { storageId: waveformKey };
          logger.info(
            { mediaId, storageId: waveformKey },
            "Waveform generated",
          );
        }
      } else {
        logger.warn(
          { mediaId },
          "FFmpeg not available, skipping visual generation",
        );
      }
    } catch (error) {
      logger.warn(
        {
          mediaId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Visual generation failed, continuing",
      );
    }
    await ctx.completeStage(STAGES.WAVEFORM_GENERATION, {
      thumbnailStorageId: allArtifacts.thumbnailStorageId,
      waveformStorageId: allArtifacts.waveformStorageId,
    });

    // --- TRANSCRIPTION (3-tier precedence) ---
    await ctx.startStage(STAGES.TRANSCRIPTION);
    let transcriptText = "";
    let detectedLanguage: string | undefined;
    let transcriptSource:
      | "provider_captions"
      | "embedded_subtitles"
      | "stt"
      | null = null;
    try {
      // Tier 1: yt-dlp provider captions (from URL_DOWNLOAD stage)
      if (preExtractedSubtitles?.text) {
        transcriptText = preExtractedSubtitles.text;
        detectedLanguage = preExtractedSubtitles.language;
        transcriptSource = "provider_captions";
        logger.info(
          {
            mediaId,
            language: detectedLanguage,
            source: preExtractedSubtitles.source,
          },
          "Using provider captions from yt-dlp",
        );
      }

      // Tier 2: Embedded subtitle streams via ffmpeg
      if (!transcriptText && (await isFFprobeAvailable())) {
        await ctx.updateStageProgress(STAGES.TRANSCRIPTION, 10);
        try {
          const embeddedSubs = await extractEmbeddedSubtitles(mediaBuffer);
          if (embeddedSubs) {
            transcriptText = embeddedSubs.text;
            detectedLanguage = embeddedSubs.language;
            transcriptSource = "embedded_subtitles";
            logger.info({ mediaId }, "Using embedded subtitle stream");
          }
        } catch (embedError) {
          logger.warn(
            {
              mediaId,
              error:
                embedError instanceof Error
                  ? embedError.message
                  : String(embedError),
            },
            "Embedded subtitle extraction failed, continuing",
          );
        }
      }

      // Tier 3: Whisper STT fallback
      if (!transcriptText && isAudioAvailable()) {
        await ctx.updateStageProgress(STAGES.TRANSCRIPTION, 20);
        const result = await transcribe({
          file: mediaBuffer,
          fileName:
            effectiveOriginalFilename ||
            (isVideo() ? "video.mp4" : "audio.wav"),
        });
        transcriptText = result.text || "";
        detectedLanguage = (result as unknown as Record<string, unknown>)
          .language as string | undefined;
        if (transcriptText) {
          transcriptSource = "stt";
        }
      }

      if (transcriptText) {
        allArtifacts.extractedText = transcriptText;
        allArtifacts.language = detectedLanguage;
        extractedData.transcript = transcriptText;
        extractedData.language = detectedLanguage;
        extractedData.transcriptSource = transcriptSource;
        logger.info(
          {
            mediaId,
            textLength: transcriptText.length,
            language: detectedLanguage,
            transcriptSource,
          },
          "Transcription complete",
        );
      } else {
        logger.info({ mediaId }, "No transcript obtained from any source");
      }
    } catch (error) {
      logger.warn(
        {
          mediaId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Transcription failed, continuing",
      );
    }
    await ctx.completeStage(STAGES.TRANSCRIPTION, {
      extractedText: transcriptText || undefined,
      language: detectedLanguage,
      transcriptSource,
    });

    // --- AI ANALYSIS ---
    await ctx.startStage(STAGES.AI_ANALYSIS);
    try {
      if (transcriptText) {
        await ctx.updateStageProgress(STAGES.AI_ANALYSIS, 20);

        const truncatedTranscript =
          transcriptText.length > 8000
            ? `${transcriptText.slice(0, 8000)}\n\n[Transcript truncated — ${transcriptText.length} characters total]`
            : transcriptText;

        const mediaLabel = isVideo() ? "video" : "audio";
        const categoryList = isVideo()
          ? "tutorial, presentation, interview, vlog, screencast, music_video, meeting, short_clip, other"
          : "speech, podcast, interview, lecture, meeting, voice_memo, music, audiobook, sound_effect, other";

        const messages: AIMessage[] = [
          {
            role: "system",
            content: `You are a media analysis AI. Analyze the provided ${mediaLabel} transcript and return ONLY valid JSON. Do not include explanatory text.`,
          },
          {
            role: "user",
            content: `Analyze this ${mediaLabel} transcript. Provide:
- A brief one-sentence description of the content
- 3-8 relevant tags (keywords)
- Category: ${categoryList}

Transcript:
${truncatedTranscript}

Respond with JSON: { "description": "...", "tags": ["tag1", "tag2"], "category": "..." }`,
          },
        ];

        const modelResponse = await callAI(messages, "workers", {
          temperature: 0.2,
          maxTokens: 500,
          timeout: config.worker.aiTimeout || 180000,
        });

        const parsed = parseModelResponse(modelResponse);
        allArtifacts.description = parsed.description;
        allArtifacts.tags = (parsed.tags || []).slice(0, 15);
        extractedData.aiAnalysis = parsed;
        extractedData.processedTags = allArtifacts.tags;
        logger.info(
          {
            mediaId,
            category: parsed.category,
            tagCount: allArtifacts.tags?.length,
          },
          "AI analysis complete",
        );
      } else {
        // No transcript — try metadata-based analysis (title, description, filename)
        const metadataParts: string[] = [];
        if (extractedData.sourceTitle)
          metadataParts.push(`Title: ${extractedData.sourceTitle}`);
        if (extractedData.sourceDescription) {
          const desc =
            extractedData.sourceDescription.length > 2000
              ? `${extractedData.sourceDescription.slice(0, 2000)}…`
              : extractedData.sourceDescription;
          metadataParts.push(`Description: ${desc}`);
        }
        if (effectiveOriginalFilename)
          metadataParts.push(`Filename: ${effectiveOriginalFilename}`);

        if (metadataParts.length > 0) {
          await ctx.updateStageProgress(STAGES.AI_ANALYSIS, 20);
          const mediaLabel = isVideo() ? "video" : "audio";
          const categoryList = isVideo()
            ? "tutorial, presentation, interview, vlog, screencast, music_video, meeting, short_clip, other"
            : "speech, podcast, interview, lecture, meeting, voice_memo, music, audiobook, sound_effect, other";

          const metaMessages: AIMessage[] = [
            {
              role: "system",
              content: `You are a media analysis AI. Analyze the provided ${mediaLabel} metadata and return ONLY valid JSON. No transcript is available — base your analysis on the title, description, and filename.`,
            },
            {
              role: "user",
              content: `Analyze this ${mediaLabel} based on its metadata (no transcript available). Provide:
- A brief one-sentence description of the content
- 3-8 relevant tags (keywords)
- Category: ${categoryList}

${metadataParts.join("\n")}

Respond with JSON: { "description": "...", "tags": ["tag1", "tag2"], "category": "..." }`,
            },
          ];

          const metaResponse = await callAI(metaMessages, "workers", {
            temperature: 0.2,
            maxTokens: 500,
            timeout: config.worker.aiTimeout || 180000,
          });

          const parsed = parseModelResponse(metaResponse);
          allArtifacts.description = parsed.description;
          allArtifacts.tags = (parsed.tags || []).slice(0, 15);
          extractedData.aiAnalysis = parsed;
          extractedData.processedTags = allArtifacts.tags;
          logger.info(
            {
              mediaId,
              category: parsed.category,
              tagCount: allArtifacts.tags?.length,
              source: "metadata",
            },
            "AI analysis complete (from metadata)",
          );
        } else {
          logger.info(
            { mediaId },
            "No transcript or metadata available, skipping AI analysis",
          );
        }
      }
    } catch (error) {
      logger.warn(
        {
          mediaId,
          error: error instanceof Error ? error.message : String(error),
        },
        "AI analysis failed, continuing",
      );
    }
    await ctx.completeStage(STAGES.AI_ANALYSIS, {
      description: allArtifacts.description,
      tags: allArtifacts.tags,
    });

    // --- FINALIZATION ---
    await ctx.startStage(STAGES.FINALIZATION);
    await ctx.updateStageProgress(STAGES.FINALIZATION, 30);

    // Save extracted.json
    const extractedJsonBuffer = Buffer.from(
      JSON.stringify(extractedData, null, 2),
    );
    const extractedJsonKey = buildKey(
      userId,
      "media",
      mediaId,
      "extracted.json",
    );
    await storage.writeBuffer(extractedJsonKey, extractedJsonBuffer, {
      contentType: "application/json",
    });

    // Save extracted.md
    const contentMd = generateMediaContentMarkdown(extractedData);
    const extractedMdKey = buildKey(userId, "media", mediaId, "extracted.md");
    await storage.writeBuffer(extractedMdKey, Buffer.from(contentMd), {
      contentType: "text/markdown",
    });
    allArtifacts.extractedMdStorageId = extractedMdKey;

    // Save extracted.txt (transcript as plain text)
    if (transcriptText) {
      const extractedTxtKey = buildKey(
        userId,
        "media",
        mediaId,
        "extracted.txt",
      );
      await storage.writeBuffer(extractedTxtKey, Buffer.from(transcriptText), {
        contentType: "text/plain",
      });
      allArtifacts.extractedTxtStorageId = extractedTxtKey;
    }

    await ctx.updateStageProgress(STAGES.FINALIZATION, 80);
    await ctx.completeStage(STAGES.FINALIZATION, allArtifacts);

    logger.info(
      { mediaId, jobId: ctx.job.id },
      "Successfully completed media processing job",
    );
  } catch (error: unknown) {
    logger.error(
      {
        mediaId,
        jobId: ctx.job.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "FAILED media processing job",
    );
    throw error;
  }
}

export default processMediaJob;
