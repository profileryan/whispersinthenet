"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioUrl } from "@/lib/audio";
import { formatTraceDate, getFadedTraceCopy, getTraceTheme, isTraceFaded, type Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  token?: string | null;
  now?: Date;
  isClosing?: boolean;
  onDismiss?: () => void;
};

export function ListeningPanel({ trace, token, now = new Date(), isClosing = false, onDismiss }: Props) {
  const theme = getTraceTheme(trace.theme);
  const categoryLabel = trace.category === "soundscape" ? "Soundscape" : `${trace.category === "confession" ? "Confession" : "Emotion"} / ${theme.label}`;
  const shouldUsePublicFadedView = trace.status === "approved" && !token && isTraceFaded(trace, now);
  const panelRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(trace.audioUrl ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = useMemo(() => Array.from({ length: 46 }, (_, index) => 18 + ((index * 17) % 42)), []);
  const fallbackDuration = trace.durationSeconds > 0 ? trace.durationSeconds : 60;

  const syncProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      setProgress(0);
      return;
    }

    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
    setProgress(Math.min(1, Math.max(0, audio.currentTime / duration)));
  }, [fallbackDuration]);

  useEffect(() => {
    let active = true;
    setIsPlaying(false);
    setProgress(0);
    setAudioUrl(trace.audioUrl ?? null);
    if (shouldUsePublicFadedView) {
      setAudioUrl(null);
      return () => {
        active = false;
      };
    }
    void getAudioUrl(trace, token).then((url) => {
      if (active) {
        setAudioUrl(url);
      }
    });
    return () => {
      active = false;
    };
  }, [shouldUsePublicFadedView, token, trace]);

  useEffect(() => {
    if (!isPlaying) {
      if (progressFrameRef.current) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
      return;
    }

    function tick() {
      syncProgress();
      progressFrameRef.current = window.requestAnimationFrame(tick);
    }

    progressFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (progressFrameRef.current) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
    };
  }, [isPlaying, syncProgress]);

  useEffect(() => {
    return () => {
      if (progressFrameRef.current) {
        window.cancelAnimationFrame(progressFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!onDismiss) {
      return;
    }
    const dismiss = onDismiss;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        panelRef.current?.contains(target) ||
        target.closest(".map-trace-marker") ||
        target.closest(".leave-trace-button") ||
        target instanceof HTMLCanvasElement
      ) {
        return;
      }

      dismiss();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onDismiss]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      return;
    }

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seekFromWaveform(event: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const waveform = waveformRef.current;
    if (!audio || !waveform) {
      return;
    }

    const rect = waveform.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
    audio.currentTime = ratio * duration;
    setProgress(ratio);
  }

  return (
    <aside ref={panelRef} className={`listening-panel ${shouldUsePublicFadedView ? "is-faded" : ""} ${isClosing ? "is-closing" : ""}`} aria-label="Selected trace">
      {shouldUsePublicFadedView ? (
        <>
          <p className="faded-copy">{getFadedTraceCopy(trace)}</p>
          <p className="faded-date">{formatTraceDate(trace.createdAt)}</p>
        </>
      ) : (
        <>
          <div className="panel-topline">
            <span className="theme-pill" style={{ background: theme.color, color: theme.textColor }}>
              {categoryLabel}
            </span>
            <strong>{trace.displayName}</strong>
          </div>
          <p className="prompt-copy">&ldquo;{trace.prompt}&rdquo;</p>
          <div className="trace-meta">
            <span>{trace.locationLabel}</span>
            <span>{formatTraceDate(trace.createdAt)}</span>
          </div>
        </>
      )}
      {!shouldUsePublicFadedView ? (
        <>
      <div className="player-row">
        <div
          ref={waveformRef}
          className="waveform"
          style={{ "--wave-color": theme.color } as React.CSSProperties}
          role="progressbar"
          aria-label="Audio playback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onPointerDown={seekFromWaveform}
        >
          {bars.map((height, index) => {
            const isPlayed = (index + 1) / bars.length <= progress;
            return (
              <span
                key={index}
                className={isPlayed ? "is-played" : ""}
                style={{
                  height,
                  backgroundColor: isPlayed ? theme.color : undefined,
                }}
              />
            );
          })}
        </div>
        <button
          className="play-button"
          data-state={isPlaying ? "playing" : "paused"}
          onClick={togglePlayback}
          disabled={!audioUrl}
          aria-label={isPlaying ? "Pause trace" : "Play trace"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isPlaying ? "/pause.png?v=3" : "/play.png?v=3"}
            alt=""
            aria-hidden="true"
            onError={(event) => {
              event.currentTarget.hidden = true;
              event.currentTarget.parentElement?.classList.add("use-fallback-icon");
            }}
            onLoad={(event) => {
              event.currentTarget.hidden = false;
              event.currentTarget.parentElement?.classList.remove("use-fallback-icon");
            }}
          />
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
      </div>
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={syncProgress}
          onTimeUpdate={syncProgress}
          onSeeked={syncProgress}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(1);
          }}
        />
      ) : !trace.audioPath ? (
        <p className="audio-note">Audio preview is available after Supabase storage is connected.</p>
      ) : null}
        </>
      ) : null}
    </aside>
  );
}
