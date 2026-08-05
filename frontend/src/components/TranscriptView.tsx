import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import type { RecordingMeta, TranscriptJob, TranscriptResult } from "@/lib/api";

interface Props {
  recording: RecordingMeta;
  job: TranscriptJob | null;
  result: TranscriptResult | null;
  onTranscribe: () => void;
  onRenameSpeaker: (oldLabel: string, newName: string) => void;
}

const SPEAKER_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-violet-600 dark:text-violet-400",
];

const SPEAKER_DOT_COLORS = [
  "bg-blue-600 dark:bg-blue-400",
  "bg-emerald-600 dark:bg-emerald-400",
  "bg-amber-600 dark:bg-amber-400",
  "bg-rose-600 dark:bg-rose-400",
  "bg-violet-600 dark:bg-violet-400",
];

function speakerIndex(speaker: string): number {
  let hash = 0;
  for (const ch of speaker) hash = (hash + ch.charCodeAt(0)) % SPEAKER_COLORS.length;
  return hash;
}

function speakerColor(speaker: string | null): string {
  if (!speaker) return "text-foreground";
  return SPEAKER_COLORS[speakerIndex(speaker)];
}

function speakerDotColor(speaker: string): string {
  return SPEAKER_DOT_COLORS[speakerIndex(speaker)];
}

export function TranscriptView({ recording, job, result, onTranscribe, onRenameSpeaker }: Props) {
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

  const speakers = Array.from(
    new Set(result.segments.map((seg) => seg.speaker).filter((s): s is string => !!s)),
  );

  return (
    <ScrollArea className="h-full pr-4">
      {speakers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3 border-b pb-3">
          {speakers.map((speaker) => (
            <label key={speaker} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${speakerDotColor(speaker)}`} />
              <input
                className="w-32 rounded border bg-transparent px-1.5 py-0.5 text-xs"
                defaultValue={speaker}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== speaker) onRenameSpeaker(speaker, value);
                  else e.target.value = speaker;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
          ))}
        </div>
      )}
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
