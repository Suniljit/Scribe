import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DeviceSelector } from "@/components/DeviceSelector";
import { RecordingsList } from "@/components/RecordingsList";
import { TranscriptView } from "@/components/TranscriptView";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { detectCaptureMode, startBrowserCapture } from "@/lib/capture";
import type { BrowserCapture } from "@/lib/capture";
import type { AudioDevice, RecordingMeta, TranscriptJob, TranscriptResult } from "@/lib/api";

function App() {
  const [captureMode] = useState(() => detectCaptureMode());
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micIndex, setMicIndex] = useState<number | null>(null);
  const [speakerIndex, setSpeakerIndex] = useState<number | null>(null);
  const [speakerCaptureNote, setSpeakerCaptureNote] = useState<string | null>(null);
  const browserCaptureRef = useRef<BrowserCapture | null>(null);

  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [job, setJob] = useState<TranscriptJob | null>(null);
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);

  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
          const mic = list.find((d) => !d.is_likely_loopback);
          const speaker = list.find((d) => d.is_likely_loopback);
          if (mic) setMicIndex(mic.index);
          if (speaker) setSpeakerIndex(speaker.index);
        })
        .catch((e) => setError(String(e)));
    }
    refreshRecordings().catch((e) => setError(String(e)));
  }, [captureMode, refreshRecordings]);

  const selectedRecording = recordings.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    setJob(null);
    setTranscript(null);
    if (!selectedId) return;
    api
      .getTranscriptStatus(selectedId)
      .then(setJob)
      .catch(() => {});
    api
      .getTranscript(selectedId)
      .then(setTranscript)
      .catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (!job || job.status !== "running" && job.status !== "queued") return;
    const interval = setInterval(async () => {
      if (!selectedId) return;
      const status = await api.getTranscriptStatus(selectedId);
      setJob(status);
      if (status.status === "done") {
        const result = await api.getTranscript(selectedId);
        setTranscript(result);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [job, selectedId]);

  const handleStart = async () => {
    setError(null);
    setSpeakerCaptureNote(null);

    if (captureMode === "coreaudio-manual") {
      if (micIndex === null) return;
      try {
        const meta = await api.startRecording(micIndex, speakerIndex);
        setActiveRecordingId(meta.id);
        setSelectedId(meta.id);
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
        }
      } catch (captureError) {
        await api.stopRecording(meta.id).catch(() => {});
        await refreshRecordings();
        throw captureError;
      }
      setActiveRecordingId(meta.id);
      setSelectedId(meta.id);
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
      if (id === selectedId) {
        setSelectedId(null);
        setJob(null);
        setTranscript(null);
      }
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
    if (!selectedId) return;
    try {
      const j = await api.startTranscription(selectedId);
      setJob(j);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRenameSpeaker = async (oldLabel: string, newName: string) => {
    if (!selectedId) return;
    try {
      const result = await api.renameSpeaker(selectedId, oldLabel, newName);
      setTranscript(result);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-72 shrink-0 flex-col border-r">
        <div className="p-4">
          <h1 className="text-lg font-semibold">Transcribe</h1>
        </div>
        <Separator />
        <div className="flex-1 overflow-hidden">
          <RecordingsList
            recordings={recordings}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        </div>
      </aside>

      <main className="flex flex-1 flex-col gap-6 overflow-hidden p-6">
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-end gap-4">
            {captureMode === "coreaudio-manual" ? (
              <>
                <DeviceSelector
                  label="Microphone"
                  devices={devices}
                  value={micIndex}
                  onChange={setMicIndex}
                  disabled={activeRecordingId !== null}
                />
                <DeviceSelector
                  label="Speaker (system audio)"
                  devices={devices.filter((d) => d.is_likely_loopback)}
                  value={speakerIndex}
                  onChange={setSpeakerIndex}
                  allowNone
                  disabled={activeRecordingId !== null}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {captureMode === "electron-loopback"
                  ? "System audio will be captured automatically (no setup needed)."
                  : "Sharing your screen will include its audio — video won't be recorded."}
              </p>
            )}
            {activeRecordingId === null ? (
              <Button onClick={handleStart} disabled={captureMode === "coreaudio-manual" && micIndex === null}>
                Record
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleStop}>
                Stop ({formatTime(elapsed)})
              </Button>
            )}
          </div>
          {speakerCaptureNote && <p className="text-sm text-muted-foreground">{speakerCaptureNote}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border p-4">
          {selectedRecording ? (
            <>
              <h2 className="mb-3 text-sm font-semibold">{selectedRecording.name}</h2>
              {selectedRecording.bleed_detected && (
                <p className="mb-3 text-sm text-amber-600">
                  We noticed your speaker audio may be leaking into your microphone — consider using headphones next
                  time.
                </p>
              )}
              {selectedRecording.status === "stopped" && selectedRecording.audio_path && (
                <AudioPlayer key={selectedRecording.id} src={api.audioUrl(selectedRecording.id)} />
              )}
              <div className="flex-1 overflow-hidden">
                <TranscriptView
                  recording={selectedRecording}
                  job={job}
                  result={transcript}
                  onTranscribe={handleTranscribe}
                  onRenameSpeaker={handleRenameSpeaker}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a recording to view its transcript.</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
