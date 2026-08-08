import { cn } from "@/lib/utils";
import type { MeetingState } from "@/lib/meetingStatus";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "size-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-brand",
        className,
      )}
    />
  );
}

const CHIP_VARIANTS: Record<MeetingState, string> = {
  recording: "bg-destructive/15 text-destructive",
  none: "bg-hairline text-muted-foreground",
  transcribing: "bg-brand-soft text-brand",
  failed: "bg-destructive/15 text-destructive",
  "transcript-only": "bg-hairline text-foreground",
  summarizing: "bg-brand-soft text-brand",
  ready: "bg-brand-soft text-brand",
};

export function StatusChip({ state, label }: { state: MeetingState; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", CHIP_VARIANTS[state])}>
      {(state === "transcribing" || state === "summarizing") && <Spinner className="size-3" />}
      {label}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-hairline py-14 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
