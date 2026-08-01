import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AudioDevice } from "@/lib/api";

interface Props {
  label: string;
  devices: AudioDevice[];
  value: number | null;
  onChange: (index: number | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
}

export function DeviceSelector({ label, devices, value, onChange, allowNone, disabled }: Props) {
  const selectedDevice = devices.find((d) => d.index === value);
  const displayLabel = selectedDevice ? selectedDevice.name : value === null ? "None" : "Select a device";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <Select
        disabled={disabled}
        value={value === null ? "none" : String(value)}
        onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
      >
        <SelectTrigger className="w-full min-w-[280px]">
          <SelectValue placeholder="Select a device">{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">None</SelectItem>}
          {devices.map((d) => (
            <SelectItem key={d.index} value={String(d.index)}>
              {d.name}
              {d.is_likely_loopback ? " (likely loopback)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
