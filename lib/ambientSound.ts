type AmbientCue = "settle" | "place" | "select" | "affirm" | "choice";

type BrowserAudioContext = typeof AudioContext;

type AmbientSound = {
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  resumeFromGesture(): Promise<void>;
  playCue(cue: AmbientCue): void;
  playTraceCue(theme?: string | null): void;
  duck(): void;
  unduck(): void;
};

let singleton: AmbientSound | null = null;

export function getAmbientSound(): AmbientSound {
  if (!singleton) {
    singleton = createAmbientSound();
  }

  return singleton;
}

function createAmbientSound(): AmbientSound {
  let enabled = false;
  let context: AudioContext | null = null;
  let cueGain: GainNode | null = null;
  let initialized = false;
  let unavailable = false;

  function getContextConstructor(): BrowserAudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    return window.AudioContext ?? null;
  }

  function ensureGraph(): AudioContext | null {
    if (unavailable) {
      return null;
    }

    if (context && initialized) {
      return context;
    }

    const AudioContextConstructor = getContextConstructor();
    if (!AudioContextConstructor) {
      unavailable = true;
      return null;
    }

    try {
      context = context ?? new AudioContextConstructor();
      cueGain = context.createGain();
      cueGain.gain.value = 1;
      cueGain.connect(context.destination);
      initialized = true;
      return context;
    } catch {
      unavailable = true;
      context = null;
      cueGain = null;
      initialized = false;
      return null;
    }
  }

  function playTone(settings: CueSettings) {
    if (!enabled) {
      return;
    }

    const audioContext = context && initialized ? context : null;
    if (!audioContext || !cueGain) {
      return;
    }

    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(settings.frequency, now);
      if (settings.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(settings.endFrequency, now + settings.duration);
      }

      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(settings.peakGain, now + settings.attack);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

      oscillator.connect(envelope).connect(cueGain);
      oscillator.start(now);
      oscillator.stop(now + settings.duration + 0.04);
    } catch {
      // Cues are decorative; failure should never affect the app.
    }
  }

  return {
    setEnabled(on: boolean) {
      enabled = on;
    },

    isEnabled() {
      return enabled;
    },

    async resumeFromGesture() {
      const audioContext = ensureGraph();
      if (!audioContext) {
        return;
      }

      try {
        if (audioContext.state !== "running") {
          await audioContext.resume();
        }
      } catch {
        // Leave the engine as a safe no-op when autoplay or WebAudio fails.
      }
    },

    playCue(cue: AmbientCue) {
      playTone(cueSettings(cue));
    },

    playTraceCue(theme?: string | null) {
      playTone(traceCueSettings(theme));
    },

    duck() {
      // No background bed is playing now; keep the method for audio-player lifecycle compatibility.
    },

    unduck() {
      // No background bed is playing now; keep the method for audio-player lifecycle compatibility.
    },
  };
}

type CueSettings = {
  frequency: number;
  endFrequency?: number;
  peakGain: number;
  attack: number;
  duration: number;
};

function cueSettings(cue: AmbientCue): CueSettings {
  switch (cue) {
    case "settle":
      return { frequency: 146.83, endFrequency: 130.81, peakGain: 0.024, attack: 0.08, duration: 0.62 };
    case "place":
      return { frequency: 164.81, endFrequency: 220, peakGain: 0.028, attack: 0.06, duration: 0.46 };
    case "select":
      return { frequency: 196, endFrequency: 174.61, peakGain: 0.02, attack: 0.035, duration: 0.24 };
    case "choice":
      return { frequency: 392, endFrequency: 493.88, peakGain: 0.018, attack: 0.02, duration: 0.18 };
    case "affirm":
      return { frequency: 523.25, endFrequency: 659.25, peakGain: 0.02, attack: 0.018, duration: 0.22 };
  }
}

function traceCueSettings(theme?: string | null): CueSettings {
  const notes: Record<string, number> = {
    joy: 329.63,
    sadness: 246.94,
    anger: 293.66,
    fear: 261.63,
    hope: 392,
    closure: 349.23,
    longing: 277.18,
    guilt: 220,
    pretence: 311.13,
    regret: 233.08,
    secret: 369.99,
    avoidance: 207.65,
    conversation: 440,
    nature: 392,
    traffic: 261.63,
    music: 493.88,
    city_life: 329.63,
  };
  const frequency = notes[String(theme ?? "")] ?? 293.66;
  return {
    frequency,
    endFrequency: frequency * 0.943874,
    peakGain: 0.019,
    attack: 0.035,
    duration: 0.24,
  };
}
