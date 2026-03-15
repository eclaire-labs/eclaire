/**
 * AudioWorklet processor for extracting raw PCM Int16 samples.
 *
 * Runs in a separate audio rendering thread. Receives float32 audio data
 * from the microphone, converts to int16 PCM, and posts the buffer to
 * the main thread via MessagePort.
 *
 * Expected AudioContext sample rate: 16000 Hz (set at context creation).
 */

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    // Take first channel (mono)
    const float32 = input[0];
    const int16 = new Int16Array(float32.length);

    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Transfer the buffer to avoid copying
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
