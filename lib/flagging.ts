export const FLAG_REASON_OPTIONS = [
  { key: "inappropriate_or_offensive", label: "Inappropriate or offensive" },
  { key: "harrassment", label: "Harassment" },
  { key: "hate_speech", label: "Hate speech" },
] as const;

export type FlagReasonKey = (typeof FLAG_REASON_OPTIONS)[number]["key"];

const FLAG_REASON_KEYS = new Set<string>(FLAG_REASON_OPTIONS.map((option) => option.key));
export const MAX_FLAG_DETAILS_LENGTH = 500;

export function normalizeFlagDetails(value: unknown) {
  return String(value ?? "").trim().slice(0, MAX_FLAG_DETAILS_LENGTH);
}

export function isFlagReasonKey(value: unknown): value is FlagReasonKey {
  return typeof value === "string" && FLAG_REASON_KEYS.has(value);
}

export function isFlagSubmissionComplete(reason: unknown, details: unknown) {
  return isFlagReasonKey(reason) || normalizeFlagDetails(details).length > 0;
}
