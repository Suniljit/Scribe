import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RecordingMeta } from "@/lib/api";

interface Props {
  recordings: RecordingMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordingsList({ recordings, selectedId, onSelect }: Props) {
  if (recordings.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No recordings yet.</p>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {recordings.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
              selectedId === r.id && "bg-accent",
            )}
          >
            <span className="font-medium">{r.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {formatDuration(r.duration_seconds)}
              {r.status === "recording" && <Badge variant="destructive">recording</Badge>}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
