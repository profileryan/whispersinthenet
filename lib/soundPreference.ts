export const SOUND_PREF_KEY = "traces:sound";

export type SoundPreference = "on" | "off";

export function parseSoundPreference(raw: string | null): SoundPreference | null {
  if (raw === "on" || raw === "off") {
    return raw;
  }

  return null;
}

export function resolveInitialSound(stored: SoundPreference | null): SoundPreference {
  return stored ?? "on";
}
