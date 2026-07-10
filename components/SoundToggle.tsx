"use client";

import { useEffect, useState } from "react";
import { getAmbientSound } from "@/lib/ambientSound";
import { parseSoundPreference, resolveInitialSound, SOUND_PREF_KEY, type SoundPreference } from "@/lib/soundPreference";

type Props = {
  className?: string;
};

export function SoundToggle({ className = "" }: Props) {
  const [preference, setPreference] = useState<SoundPreference>("on");

  useEffect(() => {
    let initial: SoundPreference = "on";

    try {
      initial = resolveInitialSound(parseSoundPreference(window.localStorage.getItem(SOUND_PREF_KEY)));
    } catch {
      initial = "on";
    }

    setPreference(initial);
    const sound = getAmbientSound();
    sound.setEnabled(initial === "on");
    if (initial !== "on") {
      return;
    }

    void sound.resumeFromGesture();
    const resumeEnabledSound = () => {
      void sound.resumeFromGesture();
    };
    window.addEventListener("pointerdown", resumeEnabledSound, { once: true });
    window.addEventListener("keydown", resumeEnabledSound, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resumeEnabledSound);
      window.removeEventListener("keydown", resumeEnabledSound);
    };
  }, []);

  async function toggleSound() {
    const nextPreference: SoundPreference = preference === "on" ? "off" : "on";
    const sound = getAmbientSound();

    if (nextPreference === "on") {
      sound.setEnabled(true);
      setPreference(nextPreference);
      persistPreference(nextPreference);
      await sound.resumeFromGesture();
      sound.playCue("select");
      return;
    }

    sound.playCue("select");
    sound.setEnabled(false);
    setPreference(nextPreference);
    persistPreference(nextPreference);
  }

  return (
    <button
      className={`sound-toggle ${className}`}
      type="button"
      aria-pressed={preference === "on"}
      data-state={preference}
      onClick={() => void toggleSound()}
    >
      <span className="sound-toggle-label">Sounds:</span>
      <span className="sound-toggle-state">{preference === "on" ? "On" : "Off"}</span>
    </button>
  );
}

function persistPreference(preference: SoundPreference) {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, preference);
  } catch {
    // Persistence is helpful, not required for the control to work.
  }
}
