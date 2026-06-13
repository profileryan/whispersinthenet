"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TraceAudioPlayer } from "@/components/TraceAudioPlayer";
import { getTraceTheme, type Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  onClose: () => void;
  onComplete: () => void;
};

export function ReplyTraceFlow({ trace, onClose, onComplete }: Props) {
  const theme = getTraceTheme(trace.theme);
  const [displayName, setDisplayName] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitReply() {
    if (!displayName.trim()) {
      setMessage("Leave a name with your response.");
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
        <p className="reply-flow-kicker">Leave some kind words for...</p>
        <article className="reply-parent-preview">
          <div className="panel-topline">
            <span className="theme-pill" style={{ background: theme.color, color: theme.textColor }}>
              {theme.label}
            </span>
            <strong>{trace.displayName}</strong>
          </div>
          <TraceAudioPlayer trace={trace} themeColor={theme.color} />
        </article>

        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Your name, real or imagined"
          maxLength={40}
          autoFocus
        />

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

        <button className="secondary-action" disabled={!displayName.trim() || !audioBlob || submitState === "submitting" || submitState === "done"} onClick={submitReply}>
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
    <>
      <button type="button" className="record-button reply-record-button" onClick={isRecording ? stopRecording : startRecording}>
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
