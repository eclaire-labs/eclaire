import { spawn } from "node:child_process";
import { Readable } from "node:stream";

/**
 * Checks if FFmpeg is available on the system.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Converts an audio buffer to OGG/Opus format suitable for Discord voice messages.
 * Requires FFmpeg to be installed.
 */
export async function convertToOggOpus(
  input: Buffer,
  inputFormat?: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      "pipe:0",
      ...(inputFormat ? ["-f", inputFormat] : []),
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
      "-ar",
      "48000",
      "-ac",
      "1",
      "-application",
      "voip",
      "-f",
      "ogg",
      "pipe:1",
    ];

    const proc = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    proc.on("error", (err) => reject(err));

    // Feed input
    const inputStream = Readable.from(input);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

/**
 * Extracts audio duration in seconds from a buffer using FFprobe.
 */
export async function getAudioDuration(input: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-i",
        "pipe:0",
        "-show_entries",
        "format=duration",
        "-v",
        "quiet",
        "-of",
        "csv=p=0",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        const duration = Number.parseFloat(output.trim());
        resolve(Number.isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`FFprobe exited with code ${code}`));
      }
    });
    proc.on("error", (err) => reject(err));

    const inputStream = Readable.from(input);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

/**
 * Generates a base64-encoded waveform from audio data for Discord voice messages.
 * Discord expects 256 bytes of amplitude data (0-255 range), base64-encoded.
 */
export async function generateWaveform(input: Buffer): Promise<string> {
  return new Promise((resolve) => {
    // Convert to raw PCM (signed 16-bit little-endian, mono, 8kHz for efficiency)
    const proc = spawn(
      "ffmpeg",
      ["-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) => {
      if (code !== 0) {
        // Fallback: return a flat waveform
        resolve(Buffer.alloc(256, 128).toString("base64"));
        return;
      }

      const pcm = Buffer.concat(chunks);
      const samples = new Int16Array(
        pcm.buffer,
        pcm.byteOffset,
        Math.floor(pcm.length / 2),
      );

      const waveformSize = 256;
      const waveform = Buffer.alloc(waveformSize);

      if (samples.length === 0) {
        resolve(waveform.toString("base64"));
        return;
      }

      const samplesPerBin = Math.max(
        1,
        Math.floor(samples.length / waveformSize),
      );

      for (let i = 0; i < waveformSize; i++) {
        const start = i * samplesPerBin;
        const end = Math.min(start + samplesPerBin, samples.length);
        let maxAmp = 0;
        for (let j = start; j < end; j++) {
          const sample = samples[j];
          const abs = sample != null ? Math.abs(sample) : 0;
          if (abs > maxAmp) maxAmp = abs;
        }
        // Normalize from Int16 range (0-32767) to byte range (0-255)
        waveform[i] = Math.round((maxAmp / 32767) * 255);
      }

      resolve(waveform.toString("base64"));
    });
    proc.on("error", () => {
      resolve(Buffer.alloc(256, 128).toString("base64"));
    });

    const inputStream = Readable.from(input);
    inputStream.pipe(proc.stdin);
    proc.stdin.on("error", () => {
      /* ignore broken pipe */
    });
  });
}

/**
 * Downloads a file from a URL and returns it as a Buffer.
 */
export async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}
