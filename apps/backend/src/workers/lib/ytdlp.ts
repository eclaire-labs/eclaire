import { spawn } from "node:child_process";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileTypeFromFile } from "file-type";
import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("ytdlp");

// ---------------------------------------------------------------------------
// Availability check (cached for process lifetime)
// ---------------------------------------------------------------------------

let cachedAvailability: boolean | null = null;

export async function isYtdlpAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;

  cachedAvailability = await new Promise<boolean>((resolve) => {
    const proc = spawn("yt-dlp", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });

  if (cachedAvailability) {
    logger.info("yt-dlp is available");
  } else {
    logger.warn("yt-dlp is not available");
  }

  return cachedAvailability;
}

// ---------------------------------------------------------------------------
// Spawn helper with timeout and stderr collection
// ---------------------------------------------------------------------------

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

function spawnWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// fetchMediaInfo
// ---------------------------------------------------------------------------

export interface YtdlpMediaInfo {
  title: string;
  description: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  uploaderName: string | null;
  mediaType: "audio" | "video";
  estimatedFileSize: number | null;
  subtitleLanguages: string[];
}

function assertHttpUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Only http/https URLs are allowed, got "${parsed.protocol}"`,
    );
  }
}

export async function fetchMediaInfo(url: string): Promise<YtdlpMediaInfo> {
  assertHttpUrl(url);
  logger.info({ url }, "Fetching media info");

  const result = await spawnWithTimeout(
    "yt-dlp",
    ["--dump-json", "--no-download", url],
    30_000,
  );

  if (result.code !== 0) {
    throw new Error(
      `yt-dlp --dump-json exited with code ${result.code}: ${result.stderr}`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error("Failed to parse yt-dlp JSON output");
  }

  const subtitleLangs = new Set<string>();
  const subtitles = data.subtitles as Record<string, unknown> | undefined;
  const autoCaptions = data.automatic_captions as
    | Record<string, unknown>
    | undefined;
  if (subtitles && typeof subtitles === "object") {
    for (const key of Object.keys(subtitles)) subtitleLangs.add(key);
  }
  if (autoCaptions && typeof autoCaptions === "object") {
    for (const key of Object.keys(autoCaptions)) subtitleLangs.add(key);
  }

  const vcodec = data.vcodec as string | undefined;
  const mediaType =
    !vcodec || vcodec === "none" || vcodec === "" ? "audio" : "video";

  const filesize = (data.filesize ?? data.filesize_approx ?? null) as
    | number
    | null;

  return {
    title: (data.title as string) ?? "Untitled",
    description: (data.description as string) ?? null,
    duration: typeof data.duration === "number" ? data.duration : null,
    thumbnailUrl: (data.thumbnail as string) ?? null,
    uploaderName: (data.uploader as string) ?? null,
    mediaType,
    estimatedFileSize: typeof filesize === "number" ? filesize : null,
    subtitleLanguages: [...subtitleLangs].sort(),
  };
}

// ---------------------------------------------------------------------------
// downloadMedia
// ---------------------------------------------------------------------------

export interface YtdlpDownloadResult {
  filePath: string;
  mimeType: string;
  fileSize: number;
  filename: string;
}

export interface DownloadMediaOptions {
  maxFileSize?: number;
}

const DEFAULT_MAX_FILE_SIZE_MB = 500;

const EXTENSION_MIME_MAP: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
};

export async function downloadMedia(
  url: string,
  outputDir: string,
  options?: DownloadMediaOptions,
): Promise<YtdlpDownloadResult> {
  assertHttpUrl(url);
  const maxMB = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE_MB;
  logger.info({ url, outputDir, maxMB }, "Downloading media");

  const args = [
    "-f",
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "-S",
    "vcodec:h264,acodec:aac",
    "--no-playlist",
    "--merge-output-format",
    "mp4",
    "--max-filesize",
    `${maxMB}m`,
    "-o",
    join(outputDir, "%(id)s.%(ext)s"),
    url,
  ];

  const result = await spawnWithTimeout("yt-dlp", args, 600_000);

  if (result.code !== 0) {
    throw new Error(
      `yt-dlp download exited with code ${result.code}: ${result.stderr}`,
    );
  }

  // Find the downloaded file in the output directory
  const entries = await readdir(outputDir);
  // Filter to media files only (ignore .part, .json, .temp etc.)
  const mediaExtensions = new Set(Object.keys(EXTENSION_MIME_MAP));
  const mediaFiles = entries.filter((name) => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ext && mediaExtensions.has(ext);
  });

  if (mediaFiles.length === 0) {
    throw new Error(
      `yt-dlp download completed but no media file found in ${outputDir}`,
    );
  }

  // Pick the most recently modified file if multiple exist
  let chosen: string = mediaFiles[0] as string;
  if (mediaFiles.length > 1) {
    let latestMtime = 0;
    for (const f of mediaFiles) {
      const s = await stat(join(outputDir, f));
      if (s.mtimeMs > latestMtime) {
        latestMtime = s.mtimeMs;
        chosen = f;
      }
    }
  }

  const filePath = join(outputDir, chosen);
  const fileStat = await stat(filePath);

  // Detect mime type via file-type, fall back to extension mapping
  let mimeType = "application/octet-stream";
  const detected = await fileTypeFromFile(filePath);
  if (detected) {
    mimeType = detected.mime;
  } else {
    const ext = chosen.split(".").pop()?.toLowerCase();
    if (ext && ext in EXTENSION_MIME_MAP) {
      mimeType = EXTENSION_MIME_MAP[ext] as string;
    }
  }

  logger.info(
    { filePath, mimeType, fileSize: fileStat.size },
    "Download complete",
  );

  return {
    filePath,
    mimeType,
    fileSize: fileStat.size,
    filename: chosen,
  };
}

// ---------------------------------------------------------------------------
// extractSubtitles
// ---------------------------------------------------------------------------

export interface YtdlpSubtitleResult {
  text: string;
  language: string;
  source: "manual" | "auto-generated";
}

export interface ExtractSubtitlesOptions {
  preferredLanguages?: string[];
}

export async function extractSubtitles(
  url: string,
  outputDir: string,
  options?: ExtractSubtitlesOptions,
): Promise<YtdlpSubtitleResult | null> {
  assertHttpUrl(url);
  const langs = options?.preferredLanguages ?? ["en"];
  const langStr = langs.join(",");

  logger.info({ url, outputDir, langs }, "Extracting subtitles");

  const args = [
    "--write-sub",
    "--write-auto-sub",
    "--sub-lang",
    langStr,
    "--sub-format",
    "vtt",
    "--skip-download",
    "-o",
    join(outputDir, "%(id)s"),
    url,
  ];

  const result = await spawnWithTimeout("yt-dlp", args, 30_000);

  if (result.code !== 0) {
    throw new Error(
      `yt-dlp subtitle extraction exited with code ${result.code}: ${result.stderr}`,
    );
  }

  // Find .vtt files in the output directory
  const entries = await readdir(outputDir);
  const vttFiles = entries.filter((name) =>
    name.toLowerCase().endsWith(".vtt"),
  );

  if (vttFiles.length === 0) {
    logger.info("No subtitle files found");
    return null;
  }

  // Separate manual and auto-generated subtitle files.
  // yt-dlp names auto-generated subs with a pattern that includes language
  // codes — manual subs typically don't contain ".auto." or similar markers.
  // A more reliable heuristic: files whose names do NOT contain the typical
  // auto-generated suffix pattern are considered manual.
  const manualFiles: string[] = [];
  const autoFiles: string[] = [];

  for (const file of vttFiles) {
    // yt-dlp auto-generated subs usually contain the language code twice or
    // have a known pattern. A simple check: the file name contains the
    // substring that yt-dlp uses for auto subs.
    const isAutoGenerated =
      /\.auto\./i.test(file) || /auto-generated/i.test(file);
    if (isAutoGenerated) {
      autoFiles.push(file);
    } else {
      manualFiles.push(file);
    }
  }

  // Prefer manual subtitles over auto-generated
  const preferManual = manualFiles.length > 0;
  const candidates = preferManual ? manualFiles : autoFiles;

  // Pick the first file that matches a preferred language, or just the first
  let chosen: string = candidates[0] as string;
  for (const lang of langs) {
    const match = candidates.find((f) =>
      f.toLowerCase().includes(`.${lang.toLowerCase()}.`),
    );
    if (match) {
      chosen = match;
      break;
    }
  }

  const filePath = join(outputDir, chosen);
  const raw = await readFile(filePath, "utf-8");

  // Detect language from filename (e.g., "abc123.en.vtt" -> "en")
  const langMatch = chosen.match(/\.([a-z]{2,3}(?:-[a-zA-Z]+)?)\.vtt$/i);
  const language = langMatch?.[1] ?? langs[0] ?? "en";

  const text = parseVttToPlainText(raw);

  if (!text.trim()) {
    logger.info("Subtitle file was empty after parsing");
    return null;
  }

  // Clean up VTT files
  for (const f of vttFiles) {
    await rm(join(outputDir, f), { force: true }).catch(() => {});
  }

  logger.info(
    { language, source: preferManual ? "manual" : "auto-generated" },
    "Subtitles extracted",
  );

  return {
    text,
    language,
    source: preferManual ? "manual" : "auto-generated",
  };
}

// ---------------------------------------------------------------------------
// VTT parser: strip headers, timestamps, metadata, deduplicate lines
// ---------------------------------------------------------------------------

function parseVttToPlainText(vtt: string): string {
  const lines = vtt.split("\n");
  const textLines: string[] = [];
  let lastLine = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip WEBVTT header and NOTE blocks
    if (line === "WEBVTT" || line.startsWith("WEBVTT ")) continue;
    if (line.startsWith("NOTE")) continue;

    // Skip cue identifiers (numeric or with arrow)
    if (/^\d+$/.test(line)) continue;

    // Skip timestamp lines: 00:00:00.000 --> 00:00:05.000
    if (/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/.test(line)) continue;

    // Skip position/alignment/style metadata
    if (
      /^(position|align|line|size|vertical|region)\s*:/i.test(line) ||
      /^<\/?[cv]\./.test(line) ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:")
    ) {
      continue;
    }

    // Skip blank lines
    if (line === "") continue;

    // Strip inline VTT tags like <c>, </c>, <b>, <i>, etc.
    const cleaned = line.replace(/<\/?[^>]+>/g, "").trim();
    if (!cleaned) continue;

    // Deduplicate consecutive identical lines
    if (cleaned === lastLine) continue;

    textLines.push(cleaned);
    lastLine = cleaned;
  }

  return textLines.join("\n");
}
