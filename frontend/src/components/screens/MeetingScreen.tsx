import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/common";
import { AudioPlayer } from "@/components/AudioPlayer";
import { TranscriptView } from "@/components/TranscriptView";
import { deriveMeetingState, meetingStatusLabel } from "@/lib/meetingStatus";
import { api } from "@/lib/api";
import type { RecordingMeta, TranscriptJob, TranscriptResult } from "@/lib/api";
import type { MeetingNotes } from "@/lib/notes";
import type { Project } from "@/lib/projects";

interface Props {
  recording: RecordingMeta;
  job: TranscriptJob | null;
  transcript: TranscriptResult | null;
  notes: MeetingNotes | undefined;
  isSummarizing: boolean;
  tab: "summary" | "transcript";
  onTabChange: (tab: "summary" | "transcript") => void;
  onTranscribe: () => void;
  onGenerate: () => void;
  onRenameSpeaker: (oldLabel: string, newName: string) => void;
  onRename: (name: string) => void;
  projects: Project[];
  currentProjectId: string | null;
  onAssign: (projectId: string | null) => void;
  breadcrumb: string;
  onBreadcrumbClick: () => void;
  onOpenChat: () => void;
}

export function MeetingScreen({
  recording,
  job,
  transcript,
  notes,
  isSummarizing,
  tab,
  onTabChange,
  onTranscribe,
  onGenerate,
  onRenameSpeaker,
  onRename,
  projects,
  currentProjectId,
  onAssign,
  breadcrumb,
  onBreadcrumbClick,
  onOpenChat,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftName, setDraftName] = useState(recording.name);

  const state = deriveMeetingState(recording, job ?? undefined, !!notes, isSummarizing);
  const showTabs = state === "transcript-only" || state === "summarizing" || state === "ready";
  const chatDisabled = !showTabs;

  return (
    <div className="relative flex flex-col gap-3 pb-16">
      <button onClick={onBreadcrumbClick} className="w-fit text-xs text-muted-foreground hover:text-foreground">
        {breadcrumb} /
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => {
                const trimmed = draftName.trim();
                if (trimmed && trimmed !== recording.name) onRename(trimmed);
                setEditingTitle(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-lg font-bold outline-none"
            />
          ) : (
            <h1
              className="cursor-text truncate text-lg font-bold"
              onClick={() => {
                setDraftName(recording.name);
                setEditingTitle(true);
              }}
            >
              {recording.name}
            </h1>
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(recording.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Move to project</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled={currentProjectId === null} onClick={() => onAssign(null)}>
              Unassigned
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} disabled={currentProjectId === p.id} onClick={() => onAssign(p.id)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {recording.status === "stopped" && recording.audio_path && <AudioPlayer src={api.audioUrl(recording.id)} />}

      {!showTabs ? (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          {recording.status === "recording" ? (
            <p className="text-sm text-muted-foreground">Stop the recording before transcribing.</p>
          ) : state === "none" ? (
            <>
              <p className="mb-1 text-sm font-semibold">No transcript yet</p>
              <p className="mb-3 text-sm text-muted-foreground">
                Transcribe this meeting to get a speaker-labeled transcript, then generate notes.
              </p>
              <Button onClick={onTranscribe} className="bg-brand text-brand-foreground hover:bg-brand/90">
                Transcribe
              </Button>
            </>
          ) : state === "transcribing" ? (
            <div className="flex items-center gap-2.5">
              <Spinner />
              <span className="text-sm font-semibold">{meetingStatusLabel(state, job ?? undefined)}</span>
            </div>
          ) : (
            <>
              <p className="mb-1 text-sm font-semibold text-destructive">Transcription failed</p>
              <p className="mb-3 text-sm text-muted-foreground">{job?.error ?? "Something went wrong."}</p>
              <Button onClick={onTranscribe}>Retry</Button>
            </>
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as "summary" | "transcript")}>
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            {state === "transcript-only" ? (
              <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
                <p className="mb-1 text-sm font-semibold">Transcript ready</p>
                <p className="mb-3 text-sm text-muted-foreground">
                  Generate structured notes: summary, action items, and topics.
                </p>
                <Button onClick={onGenerate} className="bg-brand text-brand-foreground hover:bg-brand/90">
                  Generate Summary
                </Button>
              </div>
            ) : state === "summarizing" ? (
              <div className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
                <div className="flex items-center gap-2.5">
                  <Spinner />
                  <span className="text-sm font-semibold">Generating notes…</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Summary</p>
                  <p className="text-sm leading-relaxed">{notes?.summary}</p>
                </div>
                <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Action Items</p>
                  {notes && notes.actionItems.length > 0 ? (
                    notes.actionItems.map((a, i) => (
                      <div key={i} className="flex gap-2 py-0.5 text-sm">
                        <span className="mt-1.5 size-3.5 shrink-0 rounded-[5px] border-[1.5px] border-muted-foreground" />
                        {a}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No action items detected.</p>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="transcript">
            <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <TranscriptView
                recording={recording}
                job={job}
                result={transcript}
                onTranscribe={onTranscribe}
                onRenameSpeaker={onRenameSpeaker}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}

      <button
        title={chatDisabled ? "Needs a transcript first" : "Chat about this meeting"}
        disabled={chatDisabled}
        onClick={onOpenChat}
        className="absolute bottom-0 right-0 flex size-11 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30 disabled:cursor-default disabled:bg-hairline disabled:text-muted-foreground disabled:shadow-none"
      >
        <MessageCircle className="size-5" />
      </button>
    </div>
  );
}
