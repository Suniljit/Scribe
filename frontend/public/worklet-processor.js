// Buffers incoming 128-sample AudioWorklet render quanta into ~4096-sample
// chunks and posts them to the main thread as transferable Float32Arrays,
// for streaming to the backend's /api/recordings/{id}/stream WebSocket
// (see src/lib/capture.ts). Runs on the audio rendering thread.
class ChunkerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferedSamples = 0;
    this._chunkSize = 4096;
  }

  process(inputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      this._buffer.push(channelData.slice());
      this._bufferedSamples += channelData.length;

      if (this._bufferedSamples >= this._chunkSize) {
        const chunk = new Float32Array(this._bufferedSamples);
        let offset = 0;
        for (const part of this._buffer) {
          chunk.set(part, offset);
          offset += part.length;
        }
        this.port.postMessage(chunk, [chunk.buffer]);
        this._buffer = [];
        this._bufferedSamples = 0;
      }
    }
    return true;
  }
}

registerProcessor("chunker-processor", ChunkerProcessor);
