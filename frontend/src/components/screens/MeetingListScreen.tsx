import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusChip, EmptyState } from "@/components/common";
import { deriveMeetingState, meetingStatusLabel } from "@/lib/meetingStatus";
import type { RecordingMeta, TranscriptJob } from "@/lib/api";
import type { Project } from "@/lib/projects";

interface Props {
  title: string;
  description: string;
  meetings: RecordingMeta[];
  jobs: Record<string, TranscriptJob>;
  hasNotes: (id: string) => boolean;
  summarizingIds: Set<string>;
  query: string;
  projects: Project[];
  onOpenMeeting: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAssign: (meetingId: string, projectId: string | null) => void;
  onEditProject?: () => void;
}

export function MeetingListScreen({
  title,
  description,
  meetings,
  jobs,
  hasNotes,
  summarizingIds,
  query,
  projects,
  onOpenMeeting,
  onRename,
  onDelete,
  onAssign,
  onEditProject,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const filtered = meetings.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {onEditProject && (
          <Button variant="outline" size="sm" onClick={onEditProject}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        )}
      </div>

      {meetings.length === 0 ? (
        <EmptyState title="No meetings here yet" description="Record a meeting or move one in from another list." />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meetings match “{query}”.</p>
      ) : (
        <div className="flex flex-col rounded-2xl bg-card ring-1 ring-foreground/10">
          {filtered.map((m) => {
            const state = deriveMeetingState(m, jobs[m.id], hasNotes(m.id), summarizingIds.has(m.id));
            return (
              <div
                key={m.id}
                className="group flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0"
              >
                {editingId === m.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => {
                      const trimmed = draftName.trim();
                      if (trimmed && trimmed !== m.name) onRename(m.id, trimmed);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm font-semibold outline-none"
                  />
                ) : (
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpenMeeting(m.id)}>
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </button>
                )}

                <StatusChip state={state} label={meetingStatusLabel(state, jobs[m.id])} />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100" />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingId(m.id);
                        setDraftName(m.name);
                      }}
                    >
                      <Pencil className="size-3.5" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onAssign(m.id, null)}>Move to Unassigned</DropdownMenuItem>
                    {projects.map((p) => (
                      <DropdownMenuItem key={p.id} onClick={() => onAssign(m.id, p.id)}>
                        Move to {p.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={m.status === "recording"}
                      onClick={() => onDelete(m.id)}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
