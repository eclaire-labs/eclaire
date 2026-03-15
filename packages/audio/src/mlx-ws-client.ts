/**
 * MLX Audio WebSocket Client
 *
 * Connects to mlx-audio's realtime STT WebSocket endpoint
 * at /v1/audio/transcriptions/realtime. Accepts binary int16 PCM
 * audio chunks and returns streaming transcription events.
 */

import WebSocket from "ws";

export interface MlxRealtimeConfig {
  /** Base URL of the mlx-audio server (e.g. "http://127.0.0.1:9100") */
  baseUrl: string;
  /** STT model identifier */
  model: string;
  /** Language code (e.g. "en") */
  language?: string;
}

export type MlxRealtimeEventHandler = (text: string) => void;
export type MlxRealtimeErrorHandler = (error: Error) => void;

/**
 * WebSocket client for mlx-audio's realtime transcription endpoint.
 *
 * Usage:
 *   const client = new MlxRealtimeClient(config);
 *   client.onDelta((text) => ...);
 *   client.onComplete((text) => ...);
 *   await client.connect();
 *   client.sendAudio(pcmBuffer);
 *   client.close();
 */
export class MlxRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly config: MlxRealtimeConfig;

  private deltaHandler: MlxRealtimeEventHandler | null = null;
  private completeHandler: MlxRealtimeEventHandler | null = null;
  private errorHandler: MlxRealtimeErrorHandler | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(config: MlxRealtimeConfig) {
    this.config = config;
  }

  onDelta(handler: MlxRealtimeEventHandler): void {
    this.deltaHandler = handler;
  }

  onComplete(handler: MlxRealtimeEventHandler): void {
    this.completeHandler = handler;
  }

  onError(handler: MlxRealtimeErrorHandler): void {
    this.errorHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /**
   * Open WebSocket to mlx-audio and send initial config.
   */
  async connect(): Promise<void> {
    const wsUrl = this.config.baseUrl
      .replace(/^http/, "ws")
      .replace(/\/+$/, "");

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}/v1/audio/transcriptions/realtime`);

      ws.on("open", () => {
        // Send initial configuration
        const configMsg: Record<string, string> = {
          model: this.config.model,
        };
        if (this.config.language) {
          configMsg.language = this.config.language;
        }
        ws.send(JSON.stringify(configMsg));
        this.ws = ws;
        resolve();
      });

      ws.on("message", (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as {
            type: string;
            delta?: string;
            text?: string;
          };

          if (msg.type === "delta" && msg.delta !== undefined) {
            this.deltaHandler?.(msg.delta);
          } else if (msg.type === "complete" && msg.text !== undefined) {
            this.completeHandler?.(msg.text);
          }
        } catch {
          // Non-JSON message — ignore
        }
      });

      ws.on("error", (err: Error) => {
        if (!this.ws) {
          // Connection failed
          reject(err);
        } else {
          this.errorHandler?.(err);
        }
      });

      ws.on("close", () => {
        this.ws = null;
        this.closeHandler?.();
      });
    });
  }

  /**
   * Send a binary PCM audio chunk to mlx-audio.
   */
  sendAudio(chunk: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  /**
   * Close the WebSocket connection.
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
