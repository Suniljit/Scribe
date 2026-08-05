import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DeviceSelector } from "@/components/DeviceSelector";
import { RecordingsList } from "@/components/RecordingsList";
import { TranscriptView } from "@/components/TranscriptView";
import { api } from "@/lib/api";
import type { AudioDevice, RecordingMeta, TranscriptJob, TranscriptResult } from "@/lib/api";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function App() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micIndex, setMicIndex] = useState<number | null>(null);
  const [speakerIndex, setSpeakerIndex] = useState<number | null>(null);

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
    refreshRecordings().catch((e) => setError(String(e)));
  }, [refreshRecordings]);

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
    if (micIndex === null) return;
    setError(null);
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
  };

  const handleStop = async () => {
    if (!activeRecordingId) return;
    try {
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

  const handleTranscribe = async () => {
    if (!selectedId) return;
    try {
      const j = await api.startTranscription(selectedId);
      setJob(j);
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
          />
        </div>
      </aside>

      <main className="flex flex-1 flex-col gap-6 overflow-hidden p-6">
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-end gap-4">
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
            {activeRecordingId === null ? (
              <Button onClick={handleStart} disabled={micIndex === null}>
                Record
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleStop}>
                Stop ({formatElapsed(elapsed)})
              </Button>
            )}
          </div>
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
              <div className="flex-1 overflow-hidden">
                <TranscriptView
                  recording={selectedRecording}
                  job={job}
                  result={transcript}
                  onTranscribe={handleTranscribe}
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
