"use client";

import { useEffect, useRef, useState } from "react";
import { TraceAudioPlayer } from "@/components/TraceAudioPlayer";
import { getAmbientSound } from "@/lib/ambientSound";
import { prefersReducedMotion, staggerDelays } from "@/lib/motion";
import { formatTraceDate, getFadedTraceCopy, getTraceTheme, isTraceFaded, type Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  replies?: Trace[];
  token?: string | null;
  now?: Date;
  isClosing?: boolean;
  onDismiss?: () => void;
  onReply?: () => void;
  onFlag?: (id: string) => void;
};

export function ListeningPanel({
  trace,
  replies = [],
  token,
  now = new Date(),
  isClosing = false,
  onDismiss,
  onReply,
  onFlag,
}: Props) {
  const theme = getTraceTheme(trace.theme);
  const categoryLabel = theme.label;
  const shouldUsePublicFadedView = trace.status === "approved" && !token && isTraceFaded(trace, now);
  const panelRef = useRef<HTMLElement | null>(null);
  const canReply = Boolean(onReply && trace.category === "emotion" && !shouldUsePublicFadedView && !token);
  const reduceMotion = prefersReducedMotion();
  const rootDelays = reduceMotion ? [0, 0, 0] : staggerDelays(3, 90, 240);
  const replyDelays = reduceMotion ? replies.map(() => 0) : staggerDelays(replies.length, 90, 520).map((delay) => delay + 270);
  const playbackCallbacks = {
    onPlaybackStart: () => getAmbientSound().duck(),
    onPlaybackPause: () => getAmbientSound().unduck(),
    onPlaybackEnd: () => getAmbientSound().unduck(),
    onPlaybackRestart: () => undefined,
  };

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
        <div
          className="thread-stack"
          style={
            {
              "--thread-color": theme.color,
            } as React.CSSProperties
          }
        >
          <article className="thread-root-card panel-reveal-group">
            <div className="panel-reveal is-sentence prompt-ticker" style={{ "--panel-delay": `${rootDelays[0] ?? 0}ms` } as React.CSSProperties}>
              <span className="prompt-kicker">Answering:</span>
              <span className="prompt-copy" aria-label={trace.prompt}>
                <span>&ldquo;{trace.prompt}&rdquo;</span>
                <span aria-hidden="true">&ldquo;{trace.prompt}&rdquo;</span>
              </span>
            </div>
            <div className="panel-reveal" style={{ "--panel-delay": `${rootDelays[1] ?? 0}ms` } as React.CSSProperties}>
              <TraceAudioPlayer trace={trace} token={token} themeColor={theme.color} variant="root" {...playbackCallbacks} />
            </div>
            <div className="panel-reveal" style={{ "--panel-delay": `${rootDelays[2] ?? 0}ms` } as React.CSSProperties}>
              <div className="trace-meta is-sentence" aria-label="Trace details">
                <span>{trace.displayName}</span>
                <span>{formatTraceDate(trace.createdAt)}</span>
                <OverflowTicker text={trace.locationLabel} />
              </div>
              <div className="root-action-row">
              <span className="theme-pill" style={{ background: theme.color, color: theme.textColor }}>
                {categoryLabel}
              </span>
              {onFlag ? <FlagButton id={trace.id} onFlag={onFlag} label="Flag trace" /> : null}
              {canReply ? (
                <button className="reply-trace-button" onClick={onReply}>
                  Leave A Response
                </button>
              ) : null}
              </div>
            </div>
          </article>

          {replies.length ? (
            <div className="thread-replies" aria-label="Trace replies">
              {replies.map((reply, index) => (
                <article
                  key={reply.id}
                  className="thread-reply-card panel-reveal"
                  style={{ "--reply-index": index, "--panel-delay": `${replyDelays[index] ?? 0}ms` } as React.CSSProperties}
                >
                  <div className="reply-card-meta is-sentence">
                    <span>
                      {reply.displayName} responded on {formatTraceDate(reply.createdAt)}:
                    </span>
                    {onFlag ? <FlagButton id={reply.id} onFlag={onFlag} label="Flag response" /> : null}
                  </div>
                  <TraceAudioPlayer trace={reply} token={token} themeColor={theme.color} variant="reply" {...playbackCallbacks} />
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function OverflowTicker({ text }: { text: string }) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const element = textRef.current;
    if (!container || !element) {
      return;
    }
    const tickerContainer = container;
    const tickerText = element;

    function updateOverflow() {
      setIsOverflowing(tickerText.scrollWidth > tickerContainer.clientWidth + 2);
    }

    updateOverflow();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOverflow) : null;
    observer?.observe(tickerContainer);
    window.addEventListener("resize", updateOverflow);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [text]);

  return (
    <span ref={containerRef} className={`meta-ticker ${isOverflowing ? "is-overflowing" : ""}`} aria-label={text} title={text}>
      <span ref={textRef}>{text}</span>
      {isOverflowing ? <span aria-hidden="true">{text}</span> : null}
    </span>
  );
}

function FlagButton({ id, label, onFlag }: { id: string; label: string; onFlag: (id: string) => void }) {
  return (
    <button className="flag-trace-button" type="button" onClick={() => onFlag(id)} aria-label={label} title={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/flag.svg" alt="" aria-hidden="true" />
    </button>
  );
}
