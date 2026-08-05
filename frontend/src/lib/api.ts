export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export interface AudioDevice {
  index: number;
  name: string;
  max_input_channels: number;
  max_output_channels: number;
  default_samplerate: number;
  is_likely_loopback: boolean;
}

export type RecordingStatus = "recording" | "stopped";
export type CaptureSource = "coreaudio" | "browser-push";

export interface RecordingMeta {
  id: string;
  name: string;
  created_at: string;
  status: RecordingStatus;
  duration_seconds: number | null;
  mic_device_index: number | null;
  speaker_device_index: number | null;
  capture_source: CaptureSource;
  audio_path: string | null;
  bleed_detected: boolean;
}

export type TranscriptionStatus = "not_started" | "queued" | "running" | "done" | "failed";

export interface TranscriptJob {
  recording_id: string;
  status: TranscriptionStatus;
  progress: string;
  error: string | null;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string | null;
  text: string;
}

export interface TranscriptResult {
  recording_id: string;
  language: string | null;
  segments: TranscriptSegment[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  listDevices: () => request<AudioDevice[]>("/api/devices"),

  listRecordings: () => request<RecordingMeta[]>("/api/recordings"),

  startRecording: (micDeviceIndex: number, speakerDeviceIndex: number | null, name?: string) =>
    request<RecordingMeta>("/api/recordings/start", {
      method: "POST",
      body: JSON.stringify({
        mic_device_index: micDeviceIndex,
        speaker_device_index: speakerDeviceIndex,
        capture_source: "coreaudio",
        name,
      }),
    }),

  startBrowserRecording: (name?: string) =>
    request<RecordingMeta>("/api/recordings/start", {
      method: "POST",
      body: JSON.stringify({ capture_source: "browser-push", name }),
    }),

  stopRecording: (id: string) => request<RecordingMeta>(`/api/recordings/${id}/stop`, { method: "POST" }),

  deleteRecording: (id: string) =>
    request<{ deleted: string }>(`/api/recordings/${id}`, { method: "DELETE" }),

  renameRecording: (id: string, name: string) =>
    request<RecordingMeta>(`/api/recordings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  audioUrl: (id: string) => `${API_BASE}/api/recordings/${id}/audio`,

  transcriptVttUrl: (id: string) => `${API_BASE}/api/recordings/${id}/transcript/vtt`,

  startTranscription: (id: string) => request<TranscriptJob>(`/api/recordings/${id}/transcript`, { method: "POST" }),

  getTranscriptStatus: (id: string) => request<TranscriptJob>(`/api/recordings/${id}/transcript/status`),

  getTranscript: (id: string) => request<TranscriptResult>(`/api/recordings/${id}/transcript`),

  renameSpeaker: (id: string, oldLabel: string, newName: string) =>
    request<TranscriptResult>(`/api/recordings/${id}/transcript/speakers`, {
      method: "PATCH",
      body: JSON.stringify({ old_label: oldLabel, new_name: newName }),
    }),
};
