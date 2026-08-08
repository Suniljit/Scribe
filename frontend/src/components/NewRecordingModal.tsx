import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DeviceSelector } from "@/components/DeviceSelector";
import type { AudioDevice } from "@/lib/api";
import type { CaptureMode } from "@/lib/capture";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captureMode: CaptureMode;
  devices: AudioDevice[];
  micIndex: number | null;
  speakerIndex: number | null;
  onMicChange: (index: number | null) => void;
  onSpeakerChange: (index: number | null) => void;
  onStart: () => void;
}

export function NewRecordingModal({
  open,
  onOpenChange,
  captureMode,
  devices,
  micIndex,
  speakerIndex,
  onMicChange,
  onSpeakerChange,
  onStart,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Recording</DialogTitle>
        </DialogHeader>

        {captureMode === "coreaudio-manual" ? (
          <div className="flex flex-col gap-3">
            <DeviceSelector label="Microphone" devices={devices} value={micIndex} onChange={onMicChange} />
            <DeviceSelector
              label="Speaker / loopback (optional)"
              devices={devices.filter((d) => d.is_likely_loopback)}
              value={speakerIndex}
              onChange={onSpeakerChange}
              allowNone
            />
            {devices.length === 0 && (
              <p className="text-sm text-destructive">No audio devices detected. Check your OS permissions and reopen this dialog.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {captureMode === "electron-loopback"
              ? "System audio will be captured automatically (no setup needed)."
              : "Sharing your screen will include its audio — video won't be recorded."}
          </p>
        )}

        <DialogFooter>
          <Button
            className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
            disabled={captureMode === "coreaudio-manual" && micIndex === null}
            onClick={() => {
              onOpenChange(false);
              onStart();
            }}
          >
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
