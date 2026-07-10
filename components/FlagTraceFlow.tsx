"use client";

import { useRef, useState } from "react";
import { FLAG_REASON_OPTIONS, MAX_FLAG_DETAILS_LENGTH, type FlagReasonKey, isFlagSubmissionComplete } from "@/lib/flagging";
import type { Trace } from "@/lib/traces";

type Props = {
  trace: Trace;
  onClose: () => void;
  onSubmit: (reason: FlagReasonKey | "", details: string) => Promise<void>;
};

export function FlagTraceFlow({ trace, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<FlagReasonKey | "">("");
  const [details, setDetails] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const detailsRef = useRef<HTMLTextAreaElement | null>(null);
  const canSubmit = isFlagSubmissionComplete(reason, details);

  async function submitFlag() {
    if (!canSubmit) {
      setMessage("Pick a reason or type something before submitting.");
      detailsRef.current?.focus();
      return;
    }

    setSubmitState("submitting");
    setMessage("");
    try {
      await onSubmit(reason, details.trim());
      setSubmitState("done");
    } catch (error) {
      setSubmitState("error");
      setMessage(error instanceof Error ? error.message : "We could not flag that trace. Please try again.");
    }
  }

  return (
    <section className="flag-flow" aria-label="Flag this trace">
      <button className="close-flow-button flag-close-button" onClick={onClose} aria-label="Return to trace">
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

      {submitState === "done" ? (
        <div className="flag-thanks-card" role="status" aria-live="polite">
          <h2>
            COMMUNITIES ARE PRECIOUS. THANK YOU FOR HELPING KEEP THIS ONE KIND.
          </h2>
          <button className="secondary-action" onClick={onClose} type="button">
            DONE
          </button>
        </div>
      ) : (
        <div className="flag-flow-card">
          <div className="flag-copy">
            <h2>You are flagging this trace.</h2>
            <p>This will hide it from view and send it for manual moderation. Please tell us why:</p>
          </div>

          <div className="flag-reason-grid" role="radiogroup" aria-label="Why are you flagging this trace?">
            {FLAG_REASON_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={reason === option.key ? "is-selected" : ""}
                onClick={() => {
                  setReason((current) => (current === option.key ? "" : option.key));
                  setMessage("");
                }}
                role="radio"
                aria-checked={reason === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            ref={detailsRef}
            value={details}
            onChange={(event) => {
              setDetails(event.target.value.slice(0, MAX_FLAG_DETAILS_LENGTH));
              setMessage("");
            }}
            placeholder="(OPTIONAL) TYPE SOMETHING HERE"
            aria-label={`Optional typed reason for flagging ${trace.displayName}'s trace`}
            maxLength={MAX_FLAG_DETAILS_LENGTH}
          />

          <button className="secondary-action" disabled={submitState === "submitting"} onClick={submitFlag} type="button">
            {submitState === "submitting" ? "SENDING..." : "SUBMIT"}
          </button>
          {message ? <p className="flow-message" role="alert">{message}</p> : null}
        </div>
      )}
    </section>
  );
}
