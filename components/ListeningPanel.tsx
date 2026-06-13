"use client";

import { useEffect, useRef } from "react";
import { TraceAudioPlayer } from "@/components/TraceAudioPlayer";
import { formatTraceDate, getFadedTraceCopy, getTraceTheme, isTraceFaded, type Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  replies?: Trace[];
  token?: string | null;
  now?: Date;
  isClosing?: boolean;
  onDismiss?: () => void;
  onReply?: () => void;
};

export function ListeningPanel({ trace, replies = [], token, now = new Date(), isClosing = false, onDismiss, onReply }: Props) {
  const theme = getTraceTheme(trace.theme);
  const categoryLabel = trace.category === "soundscape" ? `Soundscape / ${theme.label}` : `${trace.category === "confession" ? "Confession" : "Emotion"} / ${theme.label}`;
  const shouldUsePublicFadedView = trace.status === "approved" && !token && isTraceFaded(trace, now);
  const panelRef = useRef<HTMLElement | null>(null);
  const canReply = Boolean(onReply && trace.category === "emotion" && !shouldUsePublicFadedView && !token && trace.audioPath);

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
        target.closest(".reply-flow") ||
        target instanceof HTMLCanvasElement
      ) {
        return;
      }

      dismiss();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onDismiss]);

  return (
    <aside
      ref={panelRef}
      className={`listening-panel ${shouldUsePublicFadedView ? "is-faded" : ""} ${replies.length ? "has-replies" : ""} ${isClosing ? "is-closing" : ""}`}
      aria-label="Selected trace"
    >
      {shouldUsePublicFadedView ? (
        <>
          <p className="faded-copy">{getFadedTraceCopy(trace)}</p>
          <p className="faded-date">{formatTraceDate(trace.createdAt)}</p>
        </>
      ) : (
        <div className="thread-stack" style={{ "--thread-color": theme.color } as React.CSSProperties}>
          <article className="thread-root-card">
            <div className="panel-topline">
              <span className="theme-pill" style={{ background: theme.color, color: theme.textColor }}>
                {categoryLabel}
              </span>
              <strong>{trace.displayName}</strong>
            </div>
            <p className="prompt-copy">&ldquo;{trace.prompt}&rdquo;</p>
            <TraceAudioPlayer trace={trace} token={token} themeColor={theme.color} />
            <div className="trace-meta">
              <span>{trace.locationLabel}</span>
              <span>{formatTraceDate(trace.createdAt)}</span>
            </div>
            {canReply ? (
              <button className="reply-trace-button" onClick={onReply}>
                Leave A Response?
              </button>
            ) : null}
          </article>

          {replies.length ? (
            <div className="thread-replies" aria-label="Trace replies">
              {replies.map((reply, index) => (
                <article key={reply.id} className="thread-reply-card" style={{ "--reply-index": index } as React.CSSProperties}>
                  <div className="reply-card-meta">
                    <span>{formatTraceDate(reply.createdAt)}</span>
                    <strong>{reply.displayName}</strong>
                  </div>
                  <TraceAudioPlayer trace={reply} token={token} themeColor={theme.color} noteClassName="reply-audio-note" />
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
