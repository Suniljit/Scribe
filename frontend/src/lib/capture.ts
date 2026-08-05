import { API_BASE } from "./api";

// Native, driver-free system-audio capture replacing BlackHole (ADR 0007):
// - Electron: electron-audio-loopback (wired in electron/src/{main,preload}.js)
// - Plain browser: getDisplayMedia's audio option (Chrome/Edge only - other
//   browsers return a stream with no audio track, handled as a fallback to
//   mic-only recording by the caller).
export type CaptureMode = "electron-loopback" | "browser-displaymedia" | "coreaudio-manual";

const BROWSER_SAMPLE_RATE = 48000;
const WORKLET_URL = "/worklet-processor.js";

declare global {
  interface Window {
    scribeNative?: {
      isElectron: boolean;
      enableLoopbackAudio: () => Promise<void>;
      disableLoopbackAudio: () => Promise<void>;
    };
  }
}

export function detectCaptureMode(): CaptureMode {
  if (window.scribeNative?.isElectron) return "electron-loopback";
  if (navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) {
    return "browser-displaymedia";
  }
  return "coreaudio-manual";
}

function stripVideoTracks(stream: MediaStream): void {
  stream.getVideoTracks().forEach((t) => {
    t.stop();
    stream.removeTrack(t);
  });
}

async function getElectronLoopbackStream(): Promise<MediaStream> {
  const native = window.scribeNative;
  if (!native) throw new Error("electron-audio-loopback bridge not available");
  await native.enableLoopbackAudio();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stripVideoTracks(stream);
    return stream;
  } finally {
    await native.disableLoopbackAudio();
  }
}

async function getBrowserDisplayMediaStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  stripVideoTracks(stream);
  return stream;
}

/** Streams one MediaStream's audio, chunked via an AudioWorklet, to the
 * backend's /api/recordings/{id}/stream WebSocket for a single track. */
class TrackStreamer {
  private audioCtx: AudioContext | null = null;
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;

  async start(recordingId: string, track: "mic" | "speaker", mediaStream: MediaStream): Promise<void> {
    this.mediaStream = mediaStream;

    const wsBase = API_BASE.replace(/^http/, "ws");
    this.ws = new WebSocket(`${wsBase}/api/recordings/${recordingId}/stream?track=${track}`);
    this.ws.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = () => reject(new Error(`Failed to open ${track} stream socket`));
    });

    this.audioCtx = new AudioContext({ sampleRate: BROWSER_SAMPLE_RATE });
    await this.audioCtx.audioWorklet.addModule(WORKLET_URL);
    const source = this.audioCtx.createMediaStreamSource(mediaStream);
    const worklet = new AudioWorkletNode(this.audioCtx, "chunker-processor");
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(event.data.buffer as ArrayBuffer);
      }
    };
    source.connect(worklet);
  }

  /** Stops capture and waits for the socket to close, so the backend has
   * finished writing all previously-sent chunks before the caller issues
   * the recording's HTTP stop request. */
  stop(): Promise<void> {
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioCtx?.close();

    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.ws.onclose = () => resolve();
      this.ws.close();
      setTimeout(resolve, 1000);
    });
  }
}

export interface BrowserCapture {
  hasSpeaker: boolean;
  /** How much later (ms) the speaker track's capture pipeline became ready
   * relative to the mic track's — e.g. a screen-share permission prompt can
   * delay speaker capture by seconds. `0` when there's no speaker track.
   * The caller should report this to the backend (see api.setTrackStartOffset)
   * so the two tracks' timelines can be aligned before transcription. */
  speakerStartOffsetMs: number;
  stop: () => Promise<void>;
}

/** Starts mic + (best-effort) speaker capture for native capture modes and
 * streams both to the given recording's backend ingestion endpoint. Mic
 * capture is mandatory; if speaker capture fails or comes back with no
 * audio track (e.g. Safari/Firefox under browser-displaymedia), recording
 * proceeds mic-only. */
export async function startBrowserCapture(
  mode: Exclude<CaptureMode, "coreaudio-manual">,
  recordingId: string,
): Promise<BrowserCapture> {
  const t0 = performance.now();

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const micStreamer = new TrackStreamer();
  await micStreamer.start(recordingId, "mic", micStream);
  const micReadyAt = performance.now() - t0;

  let speakerStreamer: TrackStreamer | null = null;
  let hasSpeaker = false;
  let speakerStartOffsetMs = 0;
  try {
    const speakerStream =
      mode === "electron-loopback" ? await getElectronLoopbackStream() : await getBrowserDisplayMediaStream();
    if (speakerStream.getAudioTracks().length > 0) {
      speakerStreamer = new TrackStreamer();
      await speakerStreamer.start(recordingId, "speaker", speakerStream);
      const speakerReadyAt = performance.now() - t0;
      speakerStartOffsetMs = speakerReadyAt - micReadyAt;
      hasSpeaker = true;
    } else {
      speakerStream.getTracks().forEach((t) => t.stop());
    }
  } catch {
    hasSpeaker = false;
  }

  return {
    hasSpeaker,
    speakerStartOffsetMs,
    stop: async () => {
      await Promise.all([micStreamer.stop(), speakerStreamer?.stop() ?? Promise.resolve()]);
    },
  };
}
