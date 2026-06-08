"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { RETENTION_UNITS, SINGAPORE_CENTER, getLeaveThemesForCategory, getTraceTheme, type ThemeKey, type TraceCategory, type TraceRetentionUnit } from "@/lib/traces";

type Props = {
  onClose: () => void;
  onComplete: () => void;
};

type LocationValue = {
  latitude: number;
  longitude: number;
};

const FLOW_STEP = {
  NAME: 0,
  CATEGORY: 1,
  THEME: 2,
  RECORD: 3,
  DURATION: 4,
  LOCATION: 5,
  DONE: 6,
} as const;

type PickerOption<T extends string | number> = {
  value: T;
  label: string;
};

const RETENTION_QUANTITY_OPTIONS = Array.from({ length: 99 }, (_, index) => {
  const value = index + 1;
  return { value, label: String(value) };
});

const RETENTION_UNIT_PLURALS: Record<TraceRetentionUnit, string> = {
  hour: "Hours",
  day: "Days",
  week: "Weeks",
  month: "Months",
  year: "Years",
  decade: "Decades",
  century: "Centuries",
  millennium: "Millennia",
  epoch: "Epoch",
};

function getRetentionUnitLabel(unit: (typeof RETENTION_UNITS)[number], quantity: number) {
  if (unit.key === "epoch" || quantity === 1) {
    return unit.label;
  }

  return RETENTION_UNIT_PLURALS[unit.key];
}

export function LeaveTraceFlow({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<number>(FLOW_STEP.NAME);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState<TraceCategory | null>(null);
  const [theme, setTheme] = useState<ThemeKey | null>(null);
  const [promptIndex, setPromptIndex] = useState<number | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [retentionQuantity, setRetentionQuantity] = useState(1);
  const [retentionUnit, setRetentionUnit] = useState<TraceRetentionUnit>("week");
  const [openDurationPicker, setOpenDurationPicker] = useState<"quantity" | "unit" | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    latitude: SINGAPORE_CENTER.latitude,
    longitude: SINGAPORE_CENTER.longitude,
  });
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const leaveThemes = useMemo(() => (category ? getLeaveThemesForCategory(category) : []), [category]);
  const selectedThemeLabel = theme ? getTraceTheme(theme).label.toLowerCase() : "trace";
  const completionLabel = theme ? selectedThemeLabel : category ?? "trace";
  const completionWelcomeText = category === "confession" ? "is safe here." : "is welcome here.";
  const prompt = theme && promptIndex !== null ? getTraceTheme(theme).prompts[promptIndex] : "";

  function chooseCategory(nextCategory: TraceCategory) {
    setCategory(nextCategory);
    setTheme(null);
    setPromptIndex(null);
    setAudioBlob(null);
    setRecordingDurationSeconds(0);
    setMessage("");
  }

  function chooseTheme(nextTheme: ThemeKey) {
    if (nextTheme === theme) {
      return;
    }

    const prompts = getTraceTheme(nextTheme).prompts;
    setTheme(nextTheme);
    setPromptIndex(Math.floor(Math.random() * prompts.length));
    setAudioBlob(null);
    setRecordingDurationSeconds(0);
    setMessage("");
  }

  function showDifferentQuestion() {
    if (!theme) {
      return;
    }

    const prompts = getTraceTheme(theme).prompts;
    setPromptIndex((current) => (current === null ? 0 : (current + 1) % prompts.length));
    setAudioBlob(null);
    setRecordingDurationSeconds(0);
  }

  function updateRetentionUnit(nextUnit: TraceRetentionUnit) {
    setRetentionUnit(nextUnit);
    if (nextUnit === "epoch") {
      setRetentionQuantity(1);
      setOpenDurationPicker(null);
    }
  }

  async function submitTrace() {
    if (!theme) {
      setMessage("Choose a theme before placing your trace.");
      return;
    }

    if (!audioBlob) {
      setMessage("Record a note before placing your trace.");
      return;
    }

    setSubmitState("submitting");
    const formData = new FormData();
    formData.append("displayName", displayName.trim());
    formData.append("category", category ?? "emotion");
    formData.append("theme", theme);
    formData.append("prompt", prompt);
    formData.append("latitude", String(location.latitude));
    formData.append("longitude", String(location.longitude));
    formData.append("durationSeconds", String(recordingDurationSeconds));
    formData.append("retentionQuantity", String(retentionUnit === "epoch" ? 1 : retentionQuantity));
    formData.append("retentionUnit", retentionUnit);
    formData.append("audio", audioBlob, `trace-${Date.now()}.webm`);

    const response = await fetch("/api/submit", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setSubmitState("error");
      setMessage(data?.error ?? "Could not submit this trace yet.");
      return;
    }

    setSubmitState("done");
    setStep(FLOW_STEP.DONE);
  }

  return (
    <section className="leave-flow" aria-label="Leave a trace">
      <button className="back-button" onClick={step === FLOW_STEP.NAME ? onClose : () => setStep((current) => Math.max(FLOW_STEP.NAME, current - 1))}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/back-arrow.png"
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
            const fallback = event.currentTarget.nextElementSibling;
            if (fallback instanceof HTMLElement) {
              fallback.hidden = false;
            }
          }}
        />
        <span hidden>&lt;-</span>
      </button>

      <button className="close-flow-button" onClick={onClose} aria-label="Return to map">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/close.png"
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
            const fallback = event.currentTarget.nextElementSibling;
            if (fallback instanceof HTMLElement) {
              fallback.hidden = false;
            }
          }}
        />
        <span hidden>X</span>
      </button>

      <span key={`pulse-${step}`} className="flow-pulse" aria-hidden="true" />

      {step === FLOW_STEP.NAME ? (
        <div className="flow-card name-step">
          <h2>Who does this trace belong to?</h2>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="A name, real or imagined"
            maxLength={40}
            autoFocus
          />
          <button className="primary-action" disabled={!displayName.trim()} onClick={() => setStep(FLOW_STEP.CATEGORY)}>
            Next
          </button>
        </div>
      ) : null}

      {step === FLOW_STEP.CATEGORY ? (
        <div className="flow-card type-step">
          <h2>What would you like to share today?</h2>
          <div className="type-choice-grid">
            <button type="button" className={category === "emotion" ? "is-selected" : ""} onClick={() => chooseCategory("emotion")}>
              <strong>An Emotion</strong>
            </button>
            <button type="button" className={category === "confession" ? "is-selected" : ""} onClick={() => chooseCategory("confession")}>
              <strong>A Confession</strong>
            </button>
          </div>
          <button className="primary-action" disabled={!category} onClick={() => setStep(FLOW_STEP.THEME)}>
            Next
          </button>
        </div>
      ) : null}

      {step === FLOW_STEP.THEME ? (
        <div className="theme-step">
          <h2>{category === "confession" ? "Choose a confession" : "Choose an emotion"}</h2>
          <div className="prompt-grid">
            {leaveThemes.map((item) => (
              <button
                key={item.key}
                type="button"
                className={theme === item.key ? "is-selected" : ""}
                style={{ "--theme-color": item.color, "--theme-text": item.textColor } as React.CSSProperties}
                onClick={() => chooseTheme(item.key)}
              >
                <span className="theme-card-inner">
                  <span className="theme-card-face theme-card-front">
                    <strong>{item.label}</strong>
                  </span>
                  <span className="theme-card-face theme-card-back">
                    <strong>{item.label}</strong>
                    <span>{item.invitation}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button className="primary-action" disabled={!theme} onClick={() => setStep(FLOW_STEP.RECORD)}>
            Next
          </button>
        </div>
      ) : null}

      {step === FLOW_STEP.RECORD ? (
        <RecordingStep
          category={category}
          theme={theme}
          prompt={prompt}
          audioBlob={audioBlob}
          onRecordingStart={() => {
            setAudioBlob(null);
            setRecordingDurationSeconds(0);
          }}
          onRecordingComplete={(blob, seconds) => {
            setAudioBlob(blob);
            setRecordingDurationSeconds(seconds);
          }}
          onDifferentQuestion={showDifferentQuestion}
          onNext={() => setStep(FLOW_STEP.DURATION)}
        />
      ) : null}

      {step === FLOW_STEP.DURATION ? (
        <div className="flow-card duration-step">
          <h2 className="duration-copy">
            Traces automatically fade over time.
            <br />
            Your trace will vanish after...
          </h2>
          <div className="duration-controls" aria-label="Choose trace duration">
            <AnimatedDurationPicker
              id="trace-duration-quantity"
              label="Duration number"
              value={retentionQuantity}
              options={RETENTION_QUANTITY_OPTIONS}
              disabled={retentionUnit === "epoch"}
              isOpen={openDurationPicker === "quantity"}
              className="duration-number-picker"
              onOpenChange={(open) => setOpenDurationPicker(open ? "quantity" : null)}
              onChange={(value) => {
                setRetentionQuantity(value);
                setOpenDurationPicker(null);
              }}
            />
            <AnimatedDurationPicker
              id="trace-duration-unit"
              label="Duration unit"
              value={retentionUnit}
              options={RETENTION_UNITS.map((unit) => ({ value: unit.key, label: getRetentionUnitLabel(unit, retentionQuantity) }))}
              isOpen={openDurationPicker === "unit"}
              className="duration-unit-picker"
              onOpenChange={(open) => setOpenDurationPicker(open ? "unit" : null)}
              onChange={(value) => {
                updateRetentionUnit(value);
                setOpenDurationPicker(null);
              }}
            />
          </div>
          {retentionUnit === "epoch" ? <p className="epoch-note">Epoch means forever.</p> : null}
          <button className="primary-action" onClick={() => setStep(FLOW_STEP.LOCATION)}>
            Done
          </button>
        </div>
      ) : null}

      {step === FLOW_STEP.LOCATION ? (
        <div className="place-step">
          <h2>Place your trace</h2>
          <LocationPicker value={location} onChange={setLocation} />
          <button className="primary-action" disabled={submitState === "submitting"} onClick={submitTrace}>
            {submitState === "submitting" ? "Sending..." : "Done"}
          </button>
          {message ? <p className="flow-message">{message}</p> : null}
        </div>
      ) : null}

      {step === FLOW_STEP.DONE ? (
        <div className="flow-card done-step">
          <h2 className="welcome-heading">
            Your <span>{completionLabel}</span> {completionWelcomeText}
          </h2>
          <p>It will appear for others, in time...</p>
          <button className="primary-action" onClick={onComplete}>
            Back To Map
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AnimatedDurationPicker<T extends string | number>({
  id,
  label,
  value,
  options,
  isOpen,
  disabled = false,
  className = "",
  onOpenChange,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: Array<PickerOption<T>>;
  isOpen: boolean;
  disabled?: boolean;
  className?: string;
  onOpenChange: (open: boolean) => void;
  onChange: (value: T) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const listElement = listRef.current;
    const selectedElement = listElement?.querySelector<HTMLElement>("[data-selected='true']");
    if (!listElement || !selectedElement) {
      return;
    }

    const selectedTop = selectedElement.offsetTop;
    const centeredScrollTop = selectedTop - listElement.clientHeight / 2 + selectedElement.clientHeight / 2;
    listElement.scrollTop = Math.max(0, centeredScrollTop);
  }, [isOpen, value]);

  function togglePicker() {
    if (disabled) {
      return;
    }

    onOpenChange(!isOpen);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "Escape") {
      onOpenChange(false);
    }
  }

  return (
    <div
      className={`duration-picker ${className} ${isOpen ? "is-open" : ""} ${disabled ? "is-muted" : ""}`}
      onKeyDown={handleKeyDown}
    >
      <button
        id={id}
        type="button"
        className="duration-picker-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-list`}
        disabled={disabled}
        onClick={togglePicker}
      >
        {selectedOption.label}
      </button>
      <div id={`${id}-list`} ref={listRef} className="duration-picker-list" role="listbox" aria-labelledby={id} tabIndex={-1}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={selected}
              data-selected={selected ? "true" : undefined}
              className={selected ? "is-selected" : ""}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecordingStep({
  category,
  theme,
  prompt,
  audioBlob,
  onRecordingStart,
  onRecordingComplete,
  onDifferentQuestion,
  onNext,
}: {
  category: TraceCategory | null;
  theme: ThemeKey | null;
  prompt: string;
  audioBlob: Blob | null;
  onRecordingStart: () => void;
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onDifferentQuestion: () => void;
  onNext: () => void;
}) {
  const categoryLabel = theme ? getTraceTheme(theme).label.toLowerCase() : category ?? "trace";
  const welcomeText = category === "confession" ? "is safe here." : "is welcome here.";
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const chunksRef = useRef<BlobPart[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const previewUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : null), [audioBlob]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      activeStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not expose microphone recording here.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      onRecordingStart();
      activeStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, getPreferredAudioRecordingOptions());
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setIsRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const elapsed = Math.min(60, Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
        onRecordingComplete(blob, elapsed);
        stream.getTracks().forEach((track) => track.stop());
        if (activeStreamRef.current === stream) {
          activeStreamRef.current = null;
        }
        setIsRecording(false);
      };

      recorder.start();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 60) {
          stopRecording();
        }
      }, 250);
    } catch {
      setError("Microphone permission was not granted.");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    }
  }

  return (
    <div className={`flow-card record-step${category === "confession" ? " is-single-prompt" : ""}`}>
      <h2 className="welcome-heading">
        Your <span>{categoryLabel}</span> {welcomeText}
      </h2>
      <div className="recording-prompt">
        <p key={prompt} className="recording-question">
          {prompt}
        </p>
        {category !== "confession" ? (
          <button type="button" className="different-question-button" disabled={isRecording} onClick={onDifferentQuestion}>
            Different Question
          </button>
        ) : null}
      </div>
      <button type="button" className="record-button" onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? `Stop Recording (${Math.max(0, 60 - seconds)} Secs)` : audioBlob ? "Record Again (60 Secs)" : "Record Your Note (60 Secs)"}
      </button>
      {previewUrl ? <audio controls src={previewUrl} /> : null}
      {error ? <p className="flow-message">{error}</p> : null}
      <button className="secondary-action" disabled={!audioBlob || isRecording} onClick={onNext}>
        Done
      </button>
    </div>
  );
}

function getPreferredAudioRecordingOptions(): MediaRecorderOptions {
  const mimeTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
  const supportedMimeType = mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));

  return {
    ...(supportedMimeType ? { mimeType: supportedMimeType } : {}),
    audioBitsPerSecond: 48000,
  };
}

function LocationPicker({ value, onChange }: { value: LocationValue; onChange: (value: LocationValue) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        onChange(next);
        mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: 15 });
        markerRef.current?.setLngLat([next.longitude, next.latitude]);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [value.longitude, value.latitude],
      zoom: 15,
    });

    const marker = new maplibregl.Marker({ draggable: true })
      .setLngLat([value.longitude, value.latitude])
      .addTo(map);

    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      onChange({ longitude: lngLat.lng, latitude: lngLat.lat });
    });

    map.on("click", (event) => {
      marker.setLngLat(event.lngLat);
      onChange({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [onChange, value.latitude, value.longitude]);

  return <div ref={containerRef} className="location-picker" aria-label="Choose trace location" />;
}
