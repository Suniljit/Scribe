import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/utils";

export function RecordingBanner({ elapsed, onStop }: { elapsed: number; onStop: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-hairline bg-destructive/10 px-4 py-2 text-sm">
      <span className="size-2 shrink-0 rounded-full bg-destructive" />
      <span className="font-semibold">Recording · {formatTime(elapsed)}</span>
      <Button size="sm" variant="destructive" className="ml-auto" onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}
