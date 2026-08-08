import { useCallback, useEffect, useState } from "react";
import type { TranscriptSegment } from "@/lib/api";

export interface MeetingNotes {
  summary: string;
  actionItems: string[];
  topics: string[];
  generatedAt: string;
}

const NOTES_KEY = "scribe-notes";

function load(): Record<string, MeetingNotes> {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * No notes-generation model is wired up on the backend yet (FR-03 is
 * unimplemented server-side), so this derives a minimal extractive summary
 * from the transcript itself rather than fabricating content.
 */
function deriveNotes(segments: TranscriptSegment[]): MeetingNotes {
  const fullText = segments.map((s) => s.text.trim()).join(" ");
  const summary = fullText.length > 320 ? `${fullText.slice(0, 320).trimEnd()}…` : fullText;
  const actionKeywords = /\b(will|should|need to|todo|follow up|action item)\b/i;
  const actionItems = Array.from(
    new Set(segments.filter((s) => actionKeywords.test(s.text)).map((s) => s.text.trim())),
  ).slice(0, 5);
  return { summary, actionItems, topics: [], generatedAt: new Date().toISOString() };
}

export function useNotes() {
  const [notes, setNotes] = useState<Record<string, MeetingNotes>>(load);

  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);

  const generate = useCallback((meetingId: string, segments: TranscriptSegment[]) => {
    setNotes((prev) => ({ ...prev, [meetingId]: deriveNotes(segments) }));
  }, []);

  const clear = useCallback((meetingId: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[meetingId];
      return next;
    });
  }, []);

  return { notes, generate, clear };
}
