import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RecordingMeta } from "@/lib/api";

interface Props {
  recordings: RecordingMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordingsList({ recordings, selectedId, onSelect, onDelete }: Props) {
  if (recordings.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No recordings yet.</p>;
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {recordings.map((r) => (
          <div
            key={r.id}
            className={cn(
              "group flex items-start gap-1 rounded-md pl-3 pr-1 py-2 hover:bg-accent",
              selectedId === r.id && "bg-accent",
            )}
          >
            <button
              onClick={() => onSelect(r.id)}
              className="flex flex-1 flex-col items-start gap-1 text-left text-sm"
            >
              <span className="font-medium">{r.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {formatDuration(r.duration_seconds)}
                {r.status === "recording" && <Badge variant="destructive">recording</Badge>}
              </span>
            </button>
            {r.status !== "recording" && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.id);
                }}
                aria-label={`Delete ${r.name}`}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
