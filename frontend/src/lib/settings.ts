import { useCallback, useEffect, useState } from "react";

export type ModelLocation = "local" | "cloud";

export interface Settings {
  notesModel: ModelLocation;
  chatModel: ModelLocation;
  defaultTranscriptionModel: string;
  defaultMicIndex: number | null;
  defaultSpeakerIndex: number | null;
}

export const TRANSCRIPTION_MODELS = ["Whisper large-v3", "Whisper large-v3 (faster)", "Whisper small"];

const SETTINGS_KEY = "scribe-settings";

const DEFAULTS: Settings = {
  notesModel: "cloud",
  chatModel: "cloud",
  defaultTranscriptionModel: TRANSCRIPTION_MODELS[0],
  defaultMicIndex: null,
  defaultSpeakerIndex: null,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { settings, update };
}
