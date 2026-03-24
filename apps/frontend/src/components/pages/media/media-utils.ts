export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSampleRate(rate: number | null | undefined): string {
  if (!rate) return "-";
  return `${(rate / 1000).toFixed(1)} kHz`;
}

export function formatBitrate(bitrate: number | null | undefined): string {
  if (!bitrate) return "-";
  return `${Math.round(bitrate / 1000)} kbps`;
}

export function formatCodec(codec: string | null | undefined): string {
  if (!codec) return "-";
  return codec.toUpperCase();
}

export function formatChannels(channels: number | null | undefined): string {
  if (!channels) return "-";
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return `${channels} ch`;
}
