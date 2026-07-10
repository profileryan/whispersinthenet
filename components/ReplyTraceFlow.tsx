"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TraceAudioPlayer } from "@/components/TraceAudioPlayer";
import { getAmbientSound } from "@/lib/ambientSound";
import { mapFrequencyToBars } from "@/lib/liveWaveform";
import { prefersReducedMotion } from "@/lib/motion";
import { getTraceTheme, type Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  onClose: () => void;
  onComplete: () => void;
};

type RecordingPhase = "idle" | "requesting" | "preroll" | "recording" | "settling" | "ready";

const RECORDING_PRE_ROLL_MS = 1600;
const RECORDING_SETTLE_MS = 700;
const LIVE_WAVEFORM_FALLBACK = mapFrequencyToBars(new Uint8Array(), 34, 8, 46);

export function ReplyTraceFlow({ trace, onClose, onComplete }: Props) {
  const theme = getTraceTheme(trace.theme);
  const responsePrompt = `Leave some kind words about ${theme.label} for ${trace.displayName}...`;
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitReply() {
    if (!displayName.trim()) {
      setMessage("Leave a name with your response.");
      nameInputRef.current?.focus();
      return;
    }

    if (!audioBlob) {
      setMessage("Record a note before sending your response.");
      return;
    }

    setSubmitState("submitting");
    setMessage("");
    const formData = new FormData();
    formData.append("rootTraceId", trace.id);
    formData.append("displayName", displayName.trim());
    formData.append("durationSeconds", String(recordingDurationSeconds));
    formData.append("audio", audioBlob, `reply-${Date.now()}.webm`);

    const response = await fetch("/api/reply", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setSubmitState("error");
      setMessage(data?.error ?? "Could not send this response yet.");
      return;
    }

    setSubmitState("done");
    onComplete();
  }

  return (
    <section className="reply-flow" aria-label="Leave a response">
      <button className="close-flow-button reply-close-button" onClick={onClose} aria-label="Return to trace">
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

      <span className="flow-pulse" aria-hidden="true" />

      <div className="reply-flow-card">
        <article className="reply-parent-preview">
          <TraceAudioPlayer trace={trace} themeColor={theme.color} />
        </article>

        <p className="reply-flow-kicker">
          Leave some kind words about <span>{theme.label}</span> for <span>{trace.displayName}</span>...
        </p>

        <ReplyRecordingControl
          audioBlob={audioBlob}
          onRecordingStart={() => {
            setAudioBlob(null);
            setRecordingDurationSeconds(0);
            setMessage("");
          }}
          onRecordingComplete={(blob, seconds) => {
            setAudioBlob(blob);
            setRecordingDurationSeconds(seconds);
          }}
        />

        <input
          value={displayName}
          ref={nameInputRef}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Your name, real or imagined"
          aria-label={responsePrompt}
          maxLength={40}
        />

        <button className="secondary-action" disabled={submitState === "submitting" || submitState === "done"} onClick={submitReply}>
          {submitState === "submitting" ? "Sending..." : "Done"}
        </button>
        {message ? <p className="flow-message">{message}</p> : null}
      </div>
    </section>
  );
}

function ReplyRecordingControl({
  audioBlob,
  onRecordingStart,
  onRecordingComplete,
}: {
  audioBlob: Blob | null;
  onRecordingStart: () => void;
  onRecordingComplete: (blob: Blob, duration: number) => void;
}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const prerollTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isMountedRef = useRef(true);
  const startedAtRef = useRef<number>(0);
  const chunksRef = useRef<BlobPart[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>(audioBlob ? "ready" : "idle");
  const [liveBars, setLiveBars] = useState<number[]>(LIVE_WAVEFORM_FALLBACK);
  const [error, setError] = useState("");
  const previewUrl = useMemo(() => (audioBlob ? URL.createObjectURL(audioBlob) : null), [audioBlob]);
  const isRecording = recordingPhase === "recording";
  const isRecordBusy = recordingPhase === "requesting" || recordingPhase === "preroll" || recordingPhase === "settling";

  useEffect(() => {
    if (audioBlob && recordingPhase === "idle") {
      setRecordingPhase("ready");
    }
    if (!audioBlob && recordingPhase === "ready") {
      setRecordingPhase("idle");
    }
  }, [audioBlob, recordingPhase]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupRecordingResources();
    };
    // cleanupRecordingResources intentionally reads mutable refs at unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not expose microphone recording here.");
      return;
    }

    setRecordingPhase("requesting");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recordingStream = stream;
      onRecordingStart();
      activeStreamRef.current = recordingStream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(recordingStream, getPreferredAudioRecordingOptions());
      mediaRecorderRef.current = recorder;
      setSeconds(0);
      setLiveBars(LIVE_WAVEFORM_FALLBACK);

      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const elapsed = Math.min(60, Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
        cleanupRecordingResources({ keepRecorder: true });
        if (!isMountedRef.current) {
          mediaRecorderRef.current = null;
          return;
        }
        setRecordingPhase("settling");
        const finish = () => {
          settleTimerRef.current = null;
          if (!isMountedRef.current) {
            mediaRecorderRef.current = null;
            return;
          }
          mediaRecorderRef.current = null;
          onRecordingComplete(blob, elapsed);
          setRecordingPhase("ready");
        };
        if (prefersReducedMotion()) {
          finish();
        } else {
          settleTimerRef.current = window.setTimeout(finish, RECORDING_SETTLE_MS);
        }
      };

      setRecordingPhase("preroll");
      getAmbientSound().playCue("settle");
      const begin = () => beginMediaRecorder(recorder, recordingStream);
      if (prefersReducedMotion()) {
        begin();
      } else {
        prerollTimerRef.current = window.setTimeout(() => {
          prerollTimerRef.current = null;
          begin();
        }, RECORDING_PRE_ROLL_MS);
      }
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (!isMountedRef.current) {
        return;
      }
      if (activeStreamRef.current === stream) {
        activeStreamRef.current = null;
      }
      cleanupRecordingResources();
      setRecordingPhase(audioBlob ? "ready" : "idle");
      setError("Microphone permission was not granted.");
    }
  }

  function beginMediaRecorder(recorder: MediaRecorder, stream: MediaStream) {
    if (!isMountedRef.current || mediaRecorderRef.current !== recorder) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    startedAtRef.current = Date.now();
    setSeconds(0);
    setRecordingPhase("recording");
    startLiveWaveform(stream);
    recorder.start();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 60) {
        stopRecording();
      }
    }, 250);
  }

  function startLiveWaveform(stream: MediaStream) {
    cleanupAnalyser();
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    try {
      const audioContext = new AudioContextConstructor();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        analyser.getByteFrequencyData(frequencyData);
        setLiveBars(mapFrequencyToBars(frequencyData, 34, 8, 46));
        animationFrameRef.current = window.requestAnimationFrame(sample);
      };
      sample();
    } catch {
      cleanupAnalyser();
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
    } else {
      cleanupRecordingResources();
      setRecordingPhase(audioBlob ? "ready" : "idle");
    }
  }

  function cleanupAnalyser() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    void audioContextRef.current?.close().catch(() => undefined);
    sourceRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
  }

  function cleanupRecordingResources({ keepRecorder = false }: { keepRecorder?: boolean } = {}) {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (prerollTimerRef.current) {
      window.clearTimeout(prerollTimerRef.current);
      prerollTimerRef.current = null;
    }
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    cleanupAnalyser();
    activeStreamRef.current?.getTracks().forEach((track) => track.stop());
    activeStreamRef.current = null;
    if (!keepRecorder) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // The recorder may already be stopping; cleanup should remain safe.
        }
      }
      mediaRecorderRef.current = null;
    }
  }

  return (
    <>
      {recordingPhase === "preroll" || recordingPhase === "recording" ? (
        <div className={`record-ritual reply-record-ritual ${recordingPhase === "preroll" ? "is-preroll" : "is-recording"}`} aria-hidden="true">
          <span className="recording-ring" />
          <div className="record-live-waveform">
            {liveBars.map((height, index) => (
              <span key={index} style={{ height: `${height}px` }} />
            ))}
          </div>
        </div>
      ) : null}
      <button type="button" className="record-button reply-record-button" disabled={isRecordBusy} onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? `Stop Recording (${Math.max(0, 60 - seconds)} Secs)` : audioBlob ? "Record Again (60 Secs)" : "Record Your Note (60 Secs)"}
      </button>
      {previewUrl ? <audio controls src={previewUrl} /> : null}
      {error ? <p className="flow-message">{error}</p> : null}
    </>
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
