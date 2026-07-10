import assert from "node:assert/strict";
import test from "node:test";
import { FLAG_REASON_OPTIONS, MAX_FLAG_DETAILS_LENGTH, isFlagReasonKey, isFlagSubmissionComplete, normalizeFlagDetails } from "./flagging.ts";

test("flag reason keys match the designed categories", () => {
  assert.deepEqual(
    FLAG_REASON_OPTIONS.map((option) => option.key),
    ["inappropriate_or_offensive", "harrassment", "hate_speech"],
  );
});

test("flag submissions require a selected category or typed reason", () => {
  assert.equal(isFlagSubmissionComplete("", ""), false);
  assert.equal(isFlagSubmissionComplete("not_real", "   "), false);
  assert.equal(isFlagSubmissionComplete("hate_speech", ""), true);
  assert.equal(isFlagSubmissionComplete("", "something happened"), true);
});

test("flag details are trimmed and capped", () => {
  assert.equal(normalizeFlagDetails("  Please review this.  "), "Please review this.");
  assert.equal(normalizeFlagDetails("x".repeat(MAX_FLAG_DETAILS_LENGTH + 5)).length, MAX_FLAG_DETAILS_LENGTH);
  assert.equal(isFlagReasonKey("harrassment"), true);
  assert.equal(isFlagReasonKey("harassment"), false);
});
