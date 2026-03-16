/**
 * Audio model discovery via mlx-audio server.
 * Falls back gracefully when the server is unavailable.
 */

export async function discoverAudioModels(
  baseUrl?: string,
): Promise<string[] | null> {
  const url = baseUrl || process.env.AUDIO_BASE_URL || "http://127.0.0.1:9100";
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: { id: string }[] };
    return (data?.data || []).map((m) => m.id);
  } catch {
    return null; // Server not running
  }
}
