"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAudioUrl } from "@/lib/audio";
import { deriveAmbientWaveform } from "@/lib/liveWaveform";
import type { Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  themeColor: string;
  token?: string | null;
  variant?: "root" | "reply";
  onPlaybackStart?: (trace: Trace) => void;
  onPlaybackPause?: (trace: Trace) => void;
  onPlaybackEnd?: (trace: Trace) => void;
  onPlaybackRestart?: (trace: Trace) => void;
};

export function TraceAudioPlayer({
  trace,
  themeColor,
  token,
  variant = "root",
  onPlaybackStart,
  onPlaybackPause,
  onPlaybackEnd,
  onPlaybackRestart,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const hasEndedRef = useRef(false);
  const startNotifiedRef = useRef(false);
  const playerId = useMemo(() => `trace-audio-${trace.id}`, [trace.id]);
  const [audioUrl, setAudioUrl] = useState<string | null>(trace.audioUrl ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = useMemo(() => deriveAmbientWaveform(trace.id), [trace.id]);
  const fallbackDuration = trace.durationSeconds > 0 ? trace.durationSeconds : 60;

  const notifyStart = useCallback(() => {
    if (!startNotifiedRef.current) {
      onPlaybackStart?.(trace);
      startNotifiedRef.current = true;
    }
  }, [onPlaybackStart, trace]);

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
    hasEndedRef.current = false;
    startNotifiedRef.current = false;
    setAudioUrl(trace.audioUrl ?? null);
    void getAudioUrl(trace, token).then((url) => {
      if (active) {
        setAudioUrl(url);
      }
    });
    return () => {
      active = false;
    };
  }, [token, trace]);

  useEffect(() => {
    function handleOtherPlayback(event: Event) {
      const activeId = event instanceof CustomEvent ? event.detail?.id : null;
      if (activeId !== playerId) {
        audioRef.current?.pause();
      }
    }

    window.addEventListener("trace-audio-play", handleOtherPlayback);
    return () => window.removeEventListener("trace-audio-play", handleOtherPlayback);
  }, [playerId]);

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

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      return;
    }

    if (audio.paused) {
      const shouldRestart = hasEndedRef.current || progress >= 1 || audio.currentTime >= (Number.isFinite(audio.duration) ? audio.duration : fallbackDuration);
      if (shouldRestart) {
        audio.currentTime = 0;
        setProgress(0);
        hasEndedRef.current = false;
        startNotifiedRef.current = false;
        onPlaybackRestart?.(trace);
      }
      window.dispatchEvent(new CustomEvent("trace-audio-play", { detail: { id: playerId } }));
      try {
        await audio.play();
        setIsPlaying(true);
        notifyStart();
      } catch {
        setIsPlaying(false);
      }
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
    <>
      <div className={`player-row trace-audio-player trace-audio-player--${variant} ${isPlaying ? "is-playing" : "is-idle"}`}>
        <div
          ref={waveformRef}
          className="waveform"
          style={{ "--wave-color": themeColor } as React.CSSProperties}
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
                  animationDelay: `${(index % 9) * 90}ms`,
                  backgroundColor: isPlayed ? themeColor : undefined,
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
          onPlay={() => {
            hasEndedRef.current = false;
            setIsPlaying(true);
            notifyStart();
          }}
          onPause={() => {
            setIsPlaying(false);
            startNotifiedRef.current = false;
            if (!hasEndedRef.current) {
              onPlaybackPause?.(trace);
            }
          }}
          onEnded={() => {
            hasEndedRef.current = true;
            setIsPlaying(false);
            setProgress(1);
            startNotifiedRef.current = false;
            onPlaybackEnd?.(trace);
          }}
        />
      ) : null}
    </>
  );
}
