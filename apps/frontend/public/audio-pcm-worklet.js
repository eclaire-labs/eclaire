/**
 * AudioWorklet processor for extracting raw PCM Int16 samples.
 *
 * Runs in a separate audio rendering thread. Receives float32 audio data
 * from the microphone, converts to int16 PCM, and posts the buffer to
 * the main thread via MessagePort.
 *
 * Buffers 4800 samples (300ms at 16kHz) before sending — mlx-audio's
 * WebRTC VAD needs at least 480-sample frames to detect speech, and the
 * default AudioWorklet render quantum is only 128 samples.
 *
 * Expected AudioContext sample rate: 16000 Hz (set at context creation).
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 300ms at 16kHz = 4800 samples — matches mlx-audio VAD expectations
    this.bufferSize = 4800;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;

    // Listen for flush command from main thread (sent on stop)
    this.port.onmessage = (e) => {
      if (e.data === "flush" && this.writeIndex > 0) {
        this._sendBuffer(this.writeIndex);
        this.writeIndex = 0;
      }
    };
  }

  _sendBuffer(length) {
    const int16 = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const float32 = input[0];

    // Accumulate samples until we have a full 300ms chunk
    for (let i = 0; i < float32.length; i++) {
      this.buffer[this.writeIndex++] = float32[i];

      if (this.writeIndex >= this.bufferSize) {
        this._sendBuffer(this.bufferSize);
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
