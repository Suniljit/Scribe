import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { RecordingMeta, TranscriptJob } from "@/lib/api";

export type MeetingState = "recording" | "none" | "transcribing" | "failed" | "transcript-only" | "summarizing" | "ready";

/** Polls transcript status for a set of recordings so list screens can show live badges. */
export function useMeetingStatuses(recordings: RecordingMeta[]) {
  const [jobs, setJobs] = useState<Record<string, TranscriptJob>>({});
  const idsKey = recordings.map((r) => r.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) return;

    const refresh = async () => {
      const results = await Promise.all(
        ids.map((id) => api.getTranscriptStatus(id).catch(() => null)),
      );
      if (cancelled) return;
      setJobs((prev) => {
        const next = { ...prev };
        results.forEach((job, i) => {
          if (job) next[ids[i]] = job;
        });
        return next;
      });
    };

    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [idsKey]);

  return jobs;
}

export function deriveMeetingState(
  recording: RecordingMeta,
  job: TranscriptJob | undefined,
  hasNotes: boolean,
  isSummarizing: boolean,
): MeetingState {
  if (recording.status === "recording") return "recording";
  if (isSummarizing) return "summarizing";
  if (!job || job.status === "not_started") return "none";
  if (job.status === "queued" || job.status === "running") return "transcribing";
  if (job.status === "failed") return "failed";
  return hasNotes ? "ready" : "transcript-only";
}

export function meetingStatusLabel(state: MeetingState, job: TranscriptJob | undefined): string {
  switch (state) {
    case "recording":
      return "Recording…";
    case "none":
      return "No transcript";
    case "transcribing":
      return job?.progress || "Transcribing…";
    case "failed":
      return "Transcription failed";
    case "transcript-only":
      return "Transcribed";
    case "summarizing":
      return "Generating notes…";
    case "ready":
      return "Notes ready";
  }
}
