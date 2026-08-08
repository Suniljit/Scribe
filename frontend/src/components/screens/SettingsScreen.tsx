import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeviceSelector } from "@/components/DeviceSelector";
import { TRANSCRIPTION_MODELS, type ModelLocation, type Settings } from "@/lib/settings";
import type { AudioDevice } from "@/lib/api";
import type { CaptureMode } from "@/lib/capture";

interface Props {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  captureMode: CaptureMode;
  devices: AudioDevice[];
}

function ModelRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ModelLocation;
  onChange: (v: ModelLocation) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{value === "cloud" ? "Cloud" : "Local"}</span>
        <Switch checked={value === "cloud"} onCheckedChange={(checked) => onChange(checked ? "cloud" : "local")} />
      </div>
    </div>
  );
}

export function SettingsScreen({ settings, onUpdate, captureMode, devices }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Models</p>
        <ModelRow label="Notes generation" value={settings.notesModel} onChange={(v) => onUpdate({ notesModel: v })} />
        <ModelRow label="Chat" value={settings.chatModel} onChange={(v) => onUpdate({ chatModel: v })} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">Default transcription model</span>
          <Select
            value={settings.defaultTranscriptionModel}
            onValueChange={(v) => onUpdate({ defaultTranscriptionModel: v as string })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSCRIPTION_MODELS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Default Devices</p>
        {captureMode === "coreaudio-manual" ? (
          <div className="flex flex-col gap-3">
            <DeviceSelector
              label="Microphone"
              devices={devices}
              value={settings.defaultMicIndex}
              onChange={(v) => onUpdate({ defaultMicIndex: v })}
              allowNone
            />
            <DeviceSelector
              label="Speaker / loopback"
              devices={devices.filter((d) => d.is_likely_loopback)}
              value={settings.defaultSpeakerIndex}
              onChange={(v) => onUpdate({ defaultSpeakerIndex: v })}
              allowNone
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {captureMode === "electron-loopback"
              ? "System audio is captured automatically on this platform — there's no device to default."
              : "Device defaults aren't available in this mode — sharing your screen at recording time includes its audio."}
          </p>
        )}
      </div>
    </div>
  );
}
