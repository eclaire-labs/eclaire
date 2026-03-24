import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { type AIMessage, callAI } from "@eclaire/ai";
import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../lib/logger.js";
import { isAudioAvailable, transcribe } from "../../lib/services/audio.js";
import { buildKey, getStorage } from "../../lib/storage/index.js";
import { config } from "../config.js";

const logger = createChildLogger("media-processor");

export interface MediaJobData {
  mediaId: string;
  storageId: string;
  mimeType: string;
  userId: string;
  originalFilename?: string;
}

const STAGES = {
  PREPARATION: "media_preparation",
  METADATA_EXTRACTION: "metadata_extraction",
  WAVEFORM_GENERATION: "waveform_generation", // also used for video thumbnail
  TRANSCRIPTION: "transcription",
  AI_ANALYSIS: "ai_analysis",
  FINALIZATION: "finalization",
} as const;

type Stage = (typeof STAGES)[keyof typeof STAGES];

// --- FFmpeg/FFprobe helpers ---

async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

async function isFFprobeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
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

async function generateThumbnail(videoBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
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

// --- Main processor ---

async function processMediaJob(ctx: JobContext<MediaJobData>): Promise<void> {
  const { mediaId, storageId, mimeType, userId, originalFilename } =
    ctx.job.data;
  logger.info(
    { mediaId, jobId: ctx.job.id, userId, mimeType, storageId },
    "Starting media processing job",
  );

  if (!mediaId || !userId) {
    throw new Error(
      `Missing required job data: mediaId=${mediaId}, userId=${userId}`,
    );
  }
  if (!storageId || storageId.trim() === "") {
    throw new Error(
      `Invalid or missing storageId for media ${mediaId}. Received: ${storageId}`,
    );
  }

  const isVideo = mimeType.startsWith("video/");

  const allStages: Stage[] = [
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
    mimeType,
    originalFilename,
    processedAt: new Date().toISOString(),
    aiAnalysis: {},
  };

  try {
    // --- PREPARATION ---
    await ctx.startStage(STAGES.PREPARATION);
    const storage = getStorage();

    const MAX_MEDIA_SIZE = 500 * 1024 * 1024; // 500MB
    const meta = await storage.head(storageId);
    if (meta && meta.size > MAX_MEDIA_SIZE) {
      throw new Error(
        `Media too large: ${meta.size} bytes exceeds ${MAX_MEDIA_SIZE} byte limit`,
      );
    }

    const { buffer: mediaBuffer } = await storage.readBuffer(storageId);
    if (mediaBuffer.length === 0)
      throw new Error("Fetched media file is empty.");
    await ctx.completeStage(STAGES.PREPARATION);

    // --- METADATA EXTRACTION ---
    await ctx.startStage(STAGES.METADATA_EXTRACTION);
    try {
      if (await isFFprobeAvailable()) {
        await ctx.updateStageProgress(STAGES.METADATA_EXTRACTION, 30);
        if (isVideo) {
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
        if (isVideo) {
          const thumbnailBuffer = await generateThumbnail(mediaBuffer);
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

    // --- TRANSCRIPTION ---
    await ctx.startStage(STAGES.TRANSCRIPTION);
    let transcriptText = "";
    let detectedLanguage: string | undefined;
    try {
      if (isAudioAvailable()) {
        await ctx.updateStageProgress(STAGES.TRANSCRIPTION, 20);
        const result = await transcribe({
          file: mediaBuffer,
          fileName: originalFilename || (isVideo ? "video.mp4" : "audio.wav"),
        });
        transcriptText = result.text || "";
        detectedLanguage = (result as unknown as Record<string, unknown>)
          .language as string | undefined;
        if (transcriptText) {
          allArtifacts.extractedText = transcriptText;
          allArtifacts.language = detectedLanguage;
          extractedData.transcript = transcriptText;
          extractedData.language = detectedLanguage;
          logger.info(
            {
              mediaId,
              textLength: transcriptText.length,
              language: detectedLanguage,
            },
            "Transcription complete",
          );
        } else {
          logger.info({ mediaId }, "Transcription returned empty text");
        }
      } else {
        logger.warn(
          { mediaId },
          "Audio service not available, skipping transcription",
        );
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

        const mediaLabel = isVideo ? "video" : "audio";
        const categoryList = isVideo
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
        logger.info(
          { mediaId },
          "No transcript available, skipping AI analysis",
        );
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
