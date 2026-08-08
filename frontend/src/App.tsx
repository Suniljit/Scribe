import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { RecordingBanner } from "@/components/layout/RecordingBanner";
import { NewRecordingModal } from "@/components/NewRecordingModal";
import { ProjectDialog, type ProjectDraft } from "@/components/ProjectDialog";
import { ChatPanel } from "@/components/ChatPanel";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { MeetingListScreen } from "@/components/screens/MeetingListScreen";
import { MeetingScreen } from "@/components/screens/MeetingScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { api } from "@/lib/api";
import { useProjects } from "@/lib/projects";
import { useNotes } from "@/lib/notes";
import { useSettings } from "@/lib/settings";
import { useMeetingStatuses } from "@/lib/meetingStatus";
import { placeholderReply, type ChatMessage } from "@/lib/chat";
import { detectCaptureMode, startBrowserCapture } from "@/lib/capture";
import type { BrowserCapture } from "@/lib/capture";
import type { AudioDevice, RecordingMeta, TranscriptJob, TranscriptResult } from "@/lib/api";

type Screen = "home" | "project" | "meeting" | "settings";

function App() {
  const [captureMode] = useState(() => detectCaptureMode());
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micIndex, setMicIndex] = useState<number | null>(null);
  const [speakerIndex, setSpeakerIndex] = useState<number | null>(null);
  const [speakerCaptureNote, setSpeakerCaptureNote] = useState<string | null>(null);
  const browserCaptureRef = useRef<BrowserCapture | null>(null);

  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [job, setJob] = useState<TranscriptJob | null>(null);
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);

  const [screen, setScreen] = useState<Screen>("home");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [newRecordingOpen, setNewRecordingOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogDraft, setProjectDialogDraft] = useState<ProjectDraft | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(new Set());

  const { projects, assignments, createProject, renameProject, deleteProject, assignMeeting, meetingCount } =
    useProjects();
  const { notes, generate: generateNotes } = useNotes();
  const { settings, update: updateSettings } = useSettings();
  const jobs = useMeetingStatuses(recordings);

  const refreshRecordings = useCallback(async () => {
    const list = await api.listRecordings();
    setRecordings(list);
    return list;
  }, []);

  useEffect(() => {
    if (captureMode === "coreaudio-manual") {
      api
        .listDevices()
        .then((list) => {
          setDevices(list);
          const mic = settings.defaultMicIndex !== null ? list.find((d) => d.index === settings.defaultMicIndex) : undefined;
          const speaker =
            settings.defaultSpeakerIndex !== null ? list.find((d) => d.index === settings.defaultSpeakerIndex) : undefined;
          setMicIndex(mic ? mic.index : (list.find((d) => !d.is_likely_loopback)?.index ?? null));
          setSpeakerIndex(speaker ? speaker.index : (list.find((d) => d.is_likely_loopback)?.index ?? null));
        })
        .catch((e) => setError(String(e)));
    }
    refreshRecordings().catch((e) => setError(String(e)));
  }, [captureMode, refreshRecordings]);

  const selectedRecording = recordings.find((r) => r.id === selectedMeetingId) ?? null;

  useEffect(() => {
    setJob(null);
    setTranscript(null);
    if (!selectedMeetingId) return;
    api
      .getTranscriptStatus(selectedMeetingId)
      .then(setJob)
      .catch(() => {});
    api
      .getTranscript(selectedMeetingId)
      .then(setTranscript)
      .catch(() => {});
  }, [selectedMeetingId]);

  useEffect(() => {
    if (!job || (job.status !== "running" && job.status !== "queued")) return;
    const interval = setInterval(async () => {
      if (!selectedMeetingId) return;
      const status = await api.getTranscriptStatus(selectedMeetingId);
      setJob(status);
      if (status.status === "done") {
        const result = await api.getTranscript(selectedMeetingId);
        setTranscript(result);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [job, selectedMeetingId]);

  const handleStart = async () => {
    setError(null);
    setSpeakerCaptureNote(null);

    if (captureMode === "coreaudio-manual") {
      if (micIndex === null) return;
      try {
        const meta = await api.startRecording(micIndex, speakerIndex);
        setActiveRecordingId(meta.id);
        setSelectedMeetingId(meta.id);
        setScreen("meeting");
        setElapsed(0);
        await refreshRecordings();
        elapsedTimer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      } catch (e) {
        setError(String(e));
      }
      return;
    }

    try {
      const meta = await api.startBrowserRecording();
      try {
        const capture = await startBrowserCapture(captureMode, meta.id);
        browserCaptureRef.current = capture;
        if (!capture.hasSpeaker) {
          setSpeakerCaptureNote(
            captureMode === "browser-displaymedia"
              ? "System audio capture isn't available in this browser — recording microphone only."
              : "System audio capture wasn't granted — recording microphone only.",
          );
        } else {
          api.setTrackStartOffset(meta.id, capture.speakerStartOffsetMs).catch(() => {});
        }
      } catch (captureError) {
        await api.stopRecording(meta.id).catch(() => {});
        await refreshRecordings();
        throw captureError;
      }
      setActiveRecordingId(meta.id);
      setSelectedMeetingId(meta.id);
      setScreen("meeting");
      setElapsed(0);
      await refreshRecordings();
      elapsedTimer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStop = async () => {
    if (!activeRecordingId) return;
    try {
      if (browserCaptureRef.current) {
        await browserCaptureRef.current.stop();
        browserCaptureRef.current = null;
      }
      await api.stopRecording(activeRecordingId);
    } catch (e) {
      setError(String(e));
    } finally {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      setActiveRecordingId(null);
      await refreshRecordings();
    }
  };

  const handleDelete = async (id: string) => {
    const recording = recordings.find((r) => r.id === id);
    if (!window.confirm(`Delete "${recording?.name ?? id}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.deleteRecording(id);
      if (id === selectedMeetingId) goToList();
      await refreshRecordings();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await api.renameRecording(id, name);
      await refreshRecordings();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleTranscribe = async () => {
    if (!selectedMeetingId) return;
    try {
      const j = await api.startTranscription(selectedMeetingId);
      setJob(j);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleGenerate = () => {
    if (!selectedMeetingId || !transcript) return;
    setSummarizingIds((prev) => new Set(prev).add(selectedMeetingId));
    setTimeout(() => {
      generateNotes(selectedMeetingId, transcript.segments);
      setSummarizingIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedMeetingId);
        return next;
      });
    }, 1200);
  };

  const handleRenameSpeaker = async (oldLabel: string, newName: string) => {
    if (!selectedMeetingId) return;
    try {
      const result = await api.renameSpeaker(selectedMeetingId, oldLabel, newName);
      setTranscript(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const goHome = () => {
    setScreen("home");
    setChatOpen(false);
    setQuery("");
  };
  const goUnassigned = () => {
    setScreen("project");
    setSelectedProjectId(null);
    setChatOpen(false);
    setQuery("");
  };
  const goProject = (id: string) => {
    setScreen("project");
    setSelectedProjectId(id);
    setChatOpen(false);
    setQuery("");
  };
  const goToList = () => {
    if (selectedMeetingId && assignments[selectedMeetingId]) goProject(assignments[selectedMeetingId]);
    else goUnassigned();
  };
  const openMeeting = (id: string) => {
    setSelectedMeetingId(id);
    setScreen("meeting");
    setTab("summary");
    setChatOpen(false);
  };
  const goSettings = () => {
    setScreen("settings");
    setChatOpen(false);
  };

  const chatScopeKey = screen === "meeting" && selectedMeetingId ? `meeting:${selectedMeetingId}` : `project:${selectedProjectId}`;
  const sendChatMessage = (text: string) => {
    setChatMessages((prev) => {
      const existing = prev[chatScopeKey] ?? [];
      return { ...prev, [chatScopeKey]: [...existing, { role: "user", text }, placeholderReply()] };
    });
  };

  const currentProjectMeetings = recordings.filter((r) =>
    screen === "project" ? (selectedProjectId === null ? !assignments[r.id] : assignments[r.id] === selectedProjectId) : false,
  );

  const title =
    screen === "home"
      ? "Projects"
      : screen === "settings"
        ? "Settings"
        : screen === "project"
          ? selectedProjectId === null
            ? "Unassigned"
            : (projects.find((p) => p.id === selectedProjectId)?.name ?? "Project")
          : (selectedRecording?.name ?? "Meeting");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app-bg text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-10 size-80 rounded-full bg-blob-a blur-[80px]" />
        <div className="absolute -bottom-20 right-5 size-64 rounded-full bg-blob-b blur-[80px]" />
      </div>

      {!sidebarCollapsed && (
        <AppSidebar
          projects={projects}
          unassignedCount={recordings.filter((r) => !assignments[r.id]).length}
          screen={screen}
          activeProjectId={screen === "project" ? selectedProjectId : undefined}
          query={query}
          onQueryChange={setQuery}
          onHome={goHome}
          onUnassigned={goUnassigned}
          onProject={goProject}
          onSettings={goSettings}
          onNewRecording={() => setNewRecordingOpen(true)}
          recordingActive={activeRecordingId !== null}
        />
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <AppTopbar title={title} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((v) => !v)} />
        {activeRecordingId !== null && <RecordingBanner elapsed={elapsed} onStop={handleStop} />}

        <div className="relative flex-1 overflow-y-auto p-6">
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {speakerCaptureNote && <p className="mb-3 text-sm text-muted-foreground">{speakerCaptureNote}</p>}

          {screen === "home" && (
            <HomeScreen
              projects={projects}
              query={query}
              meetingCount={meetingCount}
              unassignedCount={recordings.filter((r) => !assignments[r.id]).length}
              onOpenProject={goProject}
              onOpenUnassigned={goUnassigned}
              onNewProject={() => {
                setProjectDialogDraft(null);
                setProjectDialogOpen(true);
              }}
            />
          )}

          {screen === "project" && (
            <MeetingListScreen
              title={selectedProjectId === null ? "Unassigned" : (projects.find((p) => p.id === selectedProjectId)?.name ?? "")}
              description={
                selectedProjectId === null
                  ? "Meetings not yet moved into a project"
                  : (projects.find((p) => p.id === selectedProjectId)?.description ?? "")
              }
              meetings={currentProjectMeetings}
              jobs={jobs}
              hasNotes={(id) => !!notes[id]}
              summarizingIds={summarizingIds}
              query={query}
              projects={projects}
              onOpenMeeting={openMeeting}
              onRename={handleRename}
              onDelete={handleDelete}
              onAssign={assignMeeting}
              onEditProject={
                selectedProjectId === null
                  ? undefined
                  : () => {
                      const p = projects.find((p) => p.id === selectedProjectId);
                      if (!p) return;
                      setProjectDialogDraft({ id: p.id, name: p.name, description: p.description });
                      setProjectDialogOpen(true);
                    }
              }
            />
          )}

          {screen === "meeting" && selectedRecording && (
            <MeetingScreen
              recording={selectedRecording}
              job={job}
              transcript={transcript}
              notes={notes[selectedRecording.id]}
              isSummarizing={summarizingIds.has(selectedRecording.id)}
              tab={tab}
              onTabChange={setTab}
              onTranscribe={handleTranscribe}
              onGenerate={handleGenerate}
              onRenameSpeaker={handleRenameSpeaker}
              onRename={(name) => handleRename(selectedRecording.id, name)}
              projects={projects}
              currentProjectId={assignments[selectedRecording.id] ?? null}
              onAssign={(projectId) => assignMeeting(selectedRecording.id, projectId)}
              breadcrumb={assignments[selectedRecording.id] ? (projects.find((p) => p.id === assignments[selectedRecording.id])?.name ?? "Project") : "Unassigned"}
              onBreadcrumbClick={goToList}
              onOpenChat={() => setChatOpen(true)}
            />
          )}

          {screen === "settings" && (
            <SettingsScreen settings={settings} onUpdate={updateSettings} captureMode={captureMode} devices={devices} />
          )}

          {chatOpen && (
            <ChatPanel
              title={screen === "meeting" ? `Chat · ${selectedRecording?.name ?? ""}` : `Chat · ${title}`}
              messages={chatMessages[chatScopeKey] ?? []}
              onSend={sendChatMessage}
              onClose={() => setChatOpen(false)}
            />
          )}
        </div>

        {screen === "project" && selectedProjectId !== null && (
          <>
            {!chatOpen && (
              <button
                title="Chat about this project"
                onClick={() => setChatOpen(true)}
                className="absolute bottom-6 right-6 flex size-11 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30"
              >
                <MessageCircle className="size-5" />
              </button>
            )}
            <button
              className="absolute bottom-7 left-6 text-xs text-muted-foreground underline"
              onClick={() => {
                if (currentProjectMeetings.length > 0) {
                  window.alert(`Move all ${currentProjectMeetings.length} meeting(s) out before deleting this project.`);
                  return;
                }
                if (!window.confirm("Delete this project?")) return;
                deleteProject(selectedProjectId);
                goHome();
              }}
            >
              Delete project
            </button>
          </>
        )}
      </div>

      <NewRecordingModal
        open={newRecordingOpen}
        onOpenChange={setNewRecordingOpen}
        captureMode={captureMode}
        devices={devices}
        micIndex={micIndex}
        speakerIndex={speakerIndex}
        onMicChange={setMicIndex}
        onSpeakerChange={setSpeakerIndex}
        onStart={handleStart}
      />

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        draft={projectDialogDraft}
        onSave={(name, description) => {
          if (projectDialogDraft?.id) renameProject(projectDialogDraft.id, name, description);
          else createProject(name, description);
        }}
      />
    </div>
  );
}

export default App;
