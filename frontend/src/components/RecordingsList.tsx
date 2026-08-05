import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
  onRename: (id: string, name: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordingsList({ recordings, selectedId, onSelect, onDelete, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (recordings.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No recordings yet.</p>;
  }

  const startEditing = (r: RecordingMeta) => {
    setEditingId(r.id);
    setDraftName(r.name);
  };

  const commitEdit = (r: RecordingMeta) => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== r.name) {
      onRename(r.id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {recordings.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(r.id)}
            className={cn(
              "group flex flex-col items-start gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
              selectedId === r.id && "bg-accent",
            )}
          >
            <span className="flex w-full items-center gap-1.5">
              {editingId === r.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => commitEdit(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(r);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded border border-input bg-background px-1 py-0.5 font-medium outline-none"
                />
              ) : (
                <>
                  <span className="flex-1 font-medium">{r.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(r);
                    }}
                  >
                    <Pencil />
                  </Button>
                  {r.status !== "recording" && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
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
                </>
              )}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {formatDuration(r.duration_seconds)}
              {r.status === "recording" && <Badge variant="destructive">recording</Badge>}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
