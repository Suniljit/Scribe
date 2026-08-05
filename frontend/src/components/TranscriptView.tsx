import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { RecordingMeta, TranscriptJob, TranscriptResult } from "@/lib/api";

interface Props {
  recording: RecordingMeta;
  job: TranscriptJob | null;
  result: TranscriptResult | null;
  onTranscribe: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEAKER_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-violet-600 dark:text-violet-400",
];

function speakerColor(speaker: string | null): string {
  if (!speaker) return "text-foreground";
  let hash = 0;
  for (const ch of speaker) hash = (hash + ch.charCodeAt(0)) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[hash];
}

export function TranscriptView({ recording, job, result, onTranscribe }: Props) {
  const isBusy = job?.status === "queued" || job?.status === "running";

  if (recording.status === "recording") {
    return <p className="text-sm text-muted-foreground">Stop the recording before transcribing.</p>;
  }

  if (!result) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Button onClick={onTranscribe} disabled={isBusy}>
          {isBusy ? job?.progress || "Transcribing…" : "Transcribe"}
        </Button>
        {job?.status === "failed" && <p className="text-sm text-destructive">{job.error}</p>}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full pr-4">
      <div className="flex flex-col gap-4">
        <a
          href={api.transcriptVttUrl(recording.id)}
          download={`${recording.name}.vtt`}
          className="self-start"
        >
          <Button variant="outline" size="sm">
            Download .vtt
          </Button>
        </a>
        {result.segments.map((seg, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={speakerColor(seg.speaker)}>{seg.speaker ?? "Unknown speaker"}</span>
              <span>{formatTime(seg.start)}</span>
            </div>
            <p className="text-sm leading-relaxed">{seg.text}</p>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
