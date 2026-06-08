export type TraceCategory = "emotion" | "confession";
export type ThemeKey =
  | "hope"
  | "joy"
  | "fear"
  | "sadness"
  | "closure"
  | "anger"
  | "longing"
  | "guilt"
  | "regret"
  | "pretence"
  | "secret"
  | "avoidance";
export type ViewMode = "map" | "immersive";
export type TraceStatus = "pending" | "approved" | "rejected";
export type TraceRetentionUnit = "hour" | "day" | "week" | "month" | "year" | "decade" | "century" | "millennium" | "epoch";

export type Trace = {
  id: string;
  displayName: string;
  category: TraceCategory;
  theme: ThemeKey;
  prompt: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  audioPath?: string | null;
  audioUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  audioFormat?: string | null;
  durationSeconds: number;
  retentionQuantity: number;
  retentionUnit: TraceRetentionUnit;
  expiresAt?: string | null;
  status: TraceStatus;
  createdAt: string;
};

export const RETENTION_UNITS: Array<{ key: TraceRetentionUnit; label: string }> = [
  { key: "hour", label: "Hour" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "decade", label: "Decade" },
  { key: "century", label: "Century" },
  { key: "millennium", label: "Millennium" },
  { key: "epoch", label: "Epoch" },
];

export const RETENTION_UNIT_KEYS = RETENTION_UNITS.map((unit) => unit.key);

const RETENTION_UNIT_SET = new Set<TraceRetentionUnit>(RETENTION_UNIT_KEYS);
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 20;

export type TraceTheme = {
  key: ThemeKey;
  label: string;
  color: string;
  textColor: string;
  invitation: string;
  prompts: string[];
};

export type TraceGroup = {
  category: TraceCategory;
  label: string;
  themes: TraceTheme[];
  leaveOrder: ThemeKey[];
  browseOrder: ThemeKey[];
};

const EMOTION_THEMES = [
  {
    key: "hope",
    label: "Hope",
    color: "#5b9400",
    textColor: "#ffffff",
    invitation: "A hope you'd like to share.",
    prompts: [
      "What is something you're looking forward to?",
      "What has made you feel hopeful lately?",
      "What is a small change you'd love to see?",
      "Who has inspired you recently?",
      "What is something you believe will get better?",
      "What are you quietly rooting for?",
    ],
  },
  {
    key: "joy",
    label: "Joy",
    color: "#ff9900",
    textColor: "#ffffff",
    invitation: "A moment of joy you'd like to share.",
    prompts: [
      "What is something you've really enjoyed lately?",
      "What made you smile recently?",
      "Who always knows how to make you laugh?",
      "What is a small pleasure you never get tired of?",
      "Where is your happy place?",
      "What is a moment you wish you could replay?",
    ],
  },
  {
    key: "fear",
    label: "Fear",
    color: "#111111",
    textColor: "#ffffff",
    invitation: "A fear you'd like to put into words.",
    prompts: [
      "What has been on your mind lately?",
      "What is something you're nervous about?",
      "Is there something you've been putting off?",
      "What feels uncertain right now?",
      "What is a worry you'd like to say out loud?",
      "What is something you wish felt less scary?",
    ],
  },
  {
    key: "sadness",
    label: "Sadness",
    color: "#0828f5",
    textColor: "#ffffff",
    invitation: "A sadness you'd like to share.",
    prompts: [
      "What has felt difficult lately?",
      "Is there something you've been missing?",
      "What is something you wish had gone differently?",
      "What has been weighing on your heart?",
      "Is there something you haven't had the chance to say?",
      "What would you like to let yourself feel for a moment?",
    ],
  },
  {
    key: "closure",
    label: "Closure",
    color: "#58a37e",
    textColor: "#ffffff",
    invitation: "Something you'd like to make peace with.",
    prompts: [
      "What are you ready to leave behind?",
      "What have you recently made peace with?",
      "What is something you've learned the hard way?",
      "What is a chapter of your life that feels complete?",
      "What is something you're proud to have made it through?",
      "What would you like to forgive yourself for?",
    ],
  },
  {
    key: "anger",
    label: "Anger",
    color: "#d00000",
    textColor: "#ffffff",
    invitation: "Something you need to say.",
    prompts: [
      "What has been frustrating you lately?",
      "What is something that just doesn't feel fair?",
      "What is a boundary you wish people respected?",
      "What is something you're tired of pretending is okay?",
      "What is one thing you wish you could change?",
      "What do you wish people took more seriously?",
    ],
  },
] satisfies TraceTheme[];

const CONFESSION_THEMES = [
  {
    key: "longing",
    label: "Longing",
    color: "#c0006f",
    textColor: "#ffffff",
    invitation: "What is something you want, but have not said aloud?",
    prompts: ["What is something you want, but have not said aloud?"],
  },
  {
    key: "guilt",
    label: "Guilt",
    color: "#6f4a00",
    textColor: "#ffffff",
    invitation: "What is something you are currently carrying that no one knows?",
    prompts: ["What is something you are currently carrying that no one knows?"],
  },
  {
    key: "regret",
    label: "Regret",
    color: "#5d5f6b",
    textColor: "#ffffff",
    invitation: "What is something you wish you had done differently?",
    prompts: ["What is something you wish you had done differently?"],
  },
  {
    key: "pretence",
    label: "Pretence",
    color: "#8b2cff",
    textColor: "#ffffff",
    invitation: "What is something you find yourself performing?",
    prompts: ["What is something you find yourself performing?"],
  },
  {
    key: "secret",
    label: "Secret",
    color: "#3d94e8",
    textColor: "#ffffff",
    invitation: "What is something you’re currently keeping to yourself?",
    prompts: ["What is something you’re currently keeping to yourself?"],
  },
  {
    key: "avoidance",
    label: "Avoidance",
    color: "#c88923",
    textColor: "#ffffff",
    invitation: "What is something you keep delaying, dodging or trying not to face?",
    prompts: ["What is something you keep delaying, dodging or trying not to face?"],
  },
] satisfies TraceTheme[];

const EMOTION_ORDER = ["hope", "joy", "fear", "sadness", "closure", "anger"] satisfies ThemeKey[];
const CONFESSION_LEAVE_ORDER = ["longing", "guilt", "pretence", "regret", "secret", "avoidance"] satisfies ThemeKey[];
const CONFESSION_BROWSE_ORDER = ["longing", "guilt", "regret", "pretence", "secret", "avoidance"] satisfies ThemeKey[];

export const TRACE_GROUPS: TraceGroup[] = [
  { category: "emotion", label: "Emotions", themes: EMOTION_THEMES, leaveOrder: EMOTION_ORDER, browseOrder: EMOTION_ORDER },
  {
    category: "confession",
    label: "Confessions",
    themes: CONFESSION_THEMES,
    leaveOrder: CONFESSION_LEAVE_ORDER,
    browseOrder: CONFESSION_BROWSE_ORDER,
  },
];

export const THEMES: TraceTheme[] = EMOTION_THEMES;

export const TRACE_THEME_BY_KEY = Object.fromEntries(
  TRACE_GROUPS.flatMap((group) => group.themes.map((theme) => [theme.key, theme])),
) as Record<ThemeKey, TraceTheme>;

export const THEME_BY_KEY = TRACE_THEME_BY_KEY;

const TRACE_CATEGORY_SET = new Set<TraceCategory>(TRACE_GROUPS.map((group) => group.category));
const TRACE_CATEGORY_BY_THEME = Object.fromEntries(
  TRACE_GROUPS.flatMap((group) => group.themes.map((theme) => [theme.key, group.category])),
) as Record<ThemeKey, TraceCategory>;

export function getTraceTheme(theme: ThemeKey) {
  return TRACE_THEME_BY_KEY[theme];
}

function getThemesForOrder(category: TraceCategory, orderKey: "leaveOrder" | "browseOrder") {
  const group = TRACE_GROUPS.find((item) => item.category === category);
  if (!group) return [];
  return group[orderKey].map((key) => getTraceTheme(key));
}

export function getLeaveThemesForCategory(category: TraceCategory) {
  return getThemesForOrder(category, "leaveOrder");
}

export function getBrowseThemesForCategory(category: TraceCategory) {
  return getThemesForOrder(category, "browseOrder");
}

export function getCategoryForTheme(theme: ThemeKey) {
  return TRACE_CATEGORY_BY_THEME[theme];
}

export function isTraceCategory(value: unknown): value is TraceCategory {
  return typeof value === "string" && TRACE_CATEGORY_SET.has(value as TraceCategory);
}

export function isValidThemeForCategory(theme: unknown, category: unknown): theme is ThemeKey {
  return typeof theme === "string" && isTraceCategory(category) && getCategoryForTheme(theme as ThemeKey) === category;
}

export const SINGAPORE_CENTER = {
  longitude: 103.7927,
  latitude: 1.2946,
};

export const DEMO_TRACES: Trace[] = [
  {
    id: "demo-hope-1",
    displayName: "Mira",
    category: "emotion",
    theme: "hope",
    prompt: THEME_BY_KEY.hope.prompts[0],
    latitude: 1.298,
    longitude: 103.786,
    locationLabel: "one-north, Singapore",
    durationSeconds: 42,
    retentionQuantity: 1,
    retentionUnit: "epoch",
    expiresAt: null,
    status: "approved",
    createdAt: "2026-07-21T09:00:00.000Z",
  },
  {
    id: "demo-joy-1",
    displayName: "Jun",
    category: "emotion",
    theme: "joy",
    prompt: THEME_BY_KEY.joy.prompts[0],
    latitude: 1.292,
    longitude: 103.801,
    locationLabel: "Alexandra Road, Singapore",
    durationSeconds: 35,
    retentionQuantity: 99,
    retentionUnit: "year",
    expiresAt: "2125-07-22T11:30:00.000Z",
    status: "approved",
    createdAt: "2026-07-22T11:30:00.000Z",
  },
  {
    id: "demo-fear-1",
    displayName: "Sarah",
    category: "emotion",
    theme: "fear",
    prompt: THEME_BY_KEY.fear.prompts[0],
    latitude: 1.2956,
    longitude: 103.7905,
    locationLabel: "Orchard Road, Singapore",
    durationSeconds: 54,
    retentionQuantity: 1,
    retentionUnit: "hour",
    expiresAt: "2026-05-27T14:00:00.000Z",
    status: "approved",
    createdAt: "2026-07-27T13:00:00.000Z",
  },
  {
    id: "demo-sadness-1",
    displayName: "A.",
    category: "emotion",
    theme: "sadness",
    prompt: THEME_BY_KEY.sadness.prompts[0],
    latitude: 1.299,
    longitude: 103.799,
    locationLabel: "Queenstown, Singapore",
    durationSeconds: 49,
    retentionQuantity: 1,
    retentionUnit: "epoch",
    expiresAt: null,
    status: "approved",
    createdAt: "2026-07-29T08:10:00.000Z",
  },
  {
    id: "demo-closure-1",
    displayName: "Nadia",
    category: "emotion",
    theme: "closure",
    prompt: THEME_BY_KEY.closure.prompts[0],
    latitude: 1.289,
    longitude: 103.795,
    locationLabel: "Dawson, Singapore",
    durationSeconds: 31,
    retentionQuantity: 1,
    retentionUnit: "month",
    expiresAt: "2026-08-30T18:20:00.000Z",
    status: "approved",
    createdAt: "2026-07-30T18:20:00.000Z",
  },
  {
    id: "demo-anger-1",
    displayName: "Kai",
    category: "emotion",
    theme: "anger",
    prompt: THEME_BY_KEY.anger.prompts[0],
    latitude: 1.291,
    longitude: 103.807,
    locationLabel: "Alexandra, Singapore",
    durationSeconds: 27,
    retentionQuantity: 1,
    retentionUnit: "week",
    expiresAt: "2026-05-08T16:45:00.000Z",
    status: "approved",
    createdAt: "2026-08-01T16:45:00.000Z",
  },
  {
    id: "demo-longing-1",
    displayName: "Lina",
    category: "confession",
    theme: "longing",
    prompt: THEME_BY_KEY.longing.prompts[0],
    latitude: 1.287,
    longitude: 103.789,
    locationLabel: "Holland Village, Singapore",
    durationSeconds: 38,
    retentionQuantity: 1,
    retentionUnit: "epoch",
    expiresAt: null,
    status: "approved",
    createdAt: "2026-08-02T10:15:00.000Z",
  },
  {
    id: "demo-guilt-1",
    displayName: "R.",
    category: "confession",
    theme: "guilt",
    prompt: THEME_BY_KEY.guilt.prompts[0],
    latitude: 1.302,
    longitude: 103.792,
    locationLabel: "Buona Vista, Singapore",
    durationSeconds: 44,
    retentionQuantity: 1,
    retentionUnit: "month",
    expiresAt: "2026-09-03T12:00:00.000Z",
    status: "approved",
    createdAt: "2026-08-03T12:00:00.000Z",
  },
  {
    id: "demo-regret-1",
    displayName: "Tessa",
    category: "confession",
    theme: "regret",
    prompt: THEME_BY_KEY.regret.prompts[0],
    latitude: 1.284,
    longitude: 103.802,
    locationLabel: "Tiong Bahru, Singapore",
    durationSeconds: 52,
    retentionQuantity: 1,
    retentionUnit: "year",
    expiresAt: "2027-08-04T09:30:00.000Z",
    status: "approved",
    createdAt: "2026-08-04T09:30:00.000Z",
  },
  {
    id: "demo-pretence-1",
    displayName: "Malik",
    category: "confession",
    theme: "pretence",
    prompt: THEME_BY_KEY.pretence.prompts[0],
    latitude: 1.296,
    longitude: 103.812,
    locationLabel: "River Valley, Singapore",
    durationSeconds: 33,
    retentionQuantity: 1,
    retentionUnit: "week",
    expiresAt: "2026-08-12T18:05:00.000Z",
    status: "approved",
    createdAt: "2026-08-05T18:05:00.000Z",
  },
  {
    id: "demo-secret-1",
    displayName: "Noor",
    category: "confession",
    theme: "secret",
    prompt: THEME_BY_KEY.secret.prompts[0],
    latitude: 1.306,
    longitude: 103.805,
    locationLabel: "Dempsey Hill, Singapore",
    durationSeconds: 46,
    retentionQuantity: 1,
    retentionUnit: "epoch",
    expiresAt: null,
    status: "approved",
    createdAt: "2026-08-06T20:25:00.000Z",
  },
  {
    id: "demo-avoidance-1",
    displayName: "Evan",
    category: "confession",
    theme: "avoidance",
    prompt: THEME_BY_KEY.avoidance.prompts[0],
    latitude: 1.281,
    longitude: 103.795,
    locationLabel: "Bukit Merah, Singapore",
    durationSeconds: 29,
    retentionQuantity: 1,
    retentionUnit: "day",
    expiresAt: "2026-08-08T07:45:00.000Z",
    status: "approved",
    createdAt: "2026-08-07T07:45:00.000Z",
  },
];

export function parseRetentionQuantityForSubmit(value: FormDataEntryValue | string | number | null | undefined) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }

  const quantity = Number(text);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : null;
}

export function parseRetentionUnitForSubmit(value: FormDataEntryValue | string | null | undefined): TraceRetentionUnit | null {
  if (typeof value !== "string") {
    return null;
  }

  return RETENTION_UNIT_SET.has(value as TraceRetentionUnit) ? (value as TraceRetentionUnit) : null;
}

export type TraceSubmissionValidation =
  | {
      ok: true;
      data: {
        displayName: string;
        category: TraceCategory;
        theme: ThemeKey;
        prompt: string;
        latitude: number;
        longitude: number;
        durationSeconds: number;
        retentionQuantity: number;
        retentionUnit: TraceRetentionUnit;
      };
    }
  | { ok: false; error: string };

export function validateTraceSubmission(input: {
  displayName?: unknown;
  category?: unknown;
  theme?: unknown;
  prompt?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  durationSeconds?: unknown;
  retentionQuantity?: unknown;
  retentionUnit?: unknown;
}): TraceSubmissionValidation {
  const displayName = String(input.displayName ?? "").trim();
  const theme = String(input.theme ?? "") as ThemeKey;
  const prompt = String(input.prompt ?? "").trim();
  const inferredCategory = getCategoryForTheme(theme);
  const categoryInput = input.category;
  const category = categoryInput === null || categoryInput === undefined || categoryInput === "" ? inferredCategory : isTraceCategory(categoryInput) ? categoryInput : null;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const durationSeconds = Number(input.durationSeconds ?? 0);
  const retentionQuantity = parseRetentionQuantityForSubmit(input.retentionQuantity as FormDataEntryValue | string | number | null | undefined);
  const retentionUnit = parseRetentionUnitForSubmit(input.retentionUnit as FormDataEntryValue | string | null | undefined);
  const selectedTheme = TRACE_THEME_BY_KEY[theme];

  if (
    !displayName ||
    displayName.length > 80 ||
    !selectedTheme ||
    !category ||
    !isValidThemeForCategory(theme, category) ||
    !selectedTheme.prompts.includes(prompt) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { ok: false, error: "Missing trace details." };
  }

  if (retentionQuantity === null || retentionUnit === null) {
    return { ok: false, error: "Choose how long this trace should remain." };
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 61) {
    return { ok: false, error: "Recording is too large or too long." };
  }

  return {
    ok: true,
    data: {
      displayName,
      category,
      theme,
      prompt,
      latitude,
      longitude,
      durationSeconds,
      retentionQuantity,
      retentionUnit,
    },
  };
}

function normalizeRetentionQuantityFromRow(value: unknown) {
  const quantity = Number(value ?? 1);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : 1;
}

function normalizeRetentionUnitFromRow(value: unknown): TraceRetentionUnit {
  return typeof value === "string" && RETENTION_UNIT_SET.has(value as TraceRetentionUnit) ? (value as TraceRetentionUnit) : "epoch";
}

export function calculateExpiresAt(createdAt: string | Date, quantity: number, unit: TraceRetentionUnit) {
  if (unit === "epoch") {
    return null;
  }

  const start = createdAt instanceof Date ? new Date(createdAt) : new Date(createdAt);
  const next = new Date(start);
  switch (unit) {
    case "hour":
      next.setTime(start.getTime() + quantity * 60 * 60 * 1000);
      break;
    case "day":
      next.setTime(start.getTime() + quantity * 24 * 60 * 60 * 1000);
      break;
    case "week":
      next.setTime(start.getTime() + quantity * 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      next.setUTCMonth(start.getUTCMonth() + quantity);
      break;
    case "year":
      next.setUTCFullYear(start.getUTCFullYear() + quantity);
      break;
    case "decade":
      next.setUTCFullYear(start.getUTCFullYear() + quantity * 10);
      break;
    case "century":
      next.setUTCFullYear(start.getUTCFullYear() + quantity * 100);
      break;
    case "millennium":
      next.setUTCFullYear(start.getUTCFullYear() + quantity * 1000);
      break;
  }
  return next.toISOString();
}

export function isTraceFaded(trace: Pick<Trace, "expiresAt">, now: Date = new Date()) {
  return Boolean(trace.expiresAt && new Date(trace.expiresAt).getTime() <= now.getTime());
}

export function getFadedTraceCopy(trace: Pick<Trace, "theme">) {
  return `There are traces of ${THEME_BY_KEY[trace.theme].label.toLowerCase()} here.`;
}

export function resolveSignedUrlTtlSeconds(expiresAt: string | null, isApproved: boolean, now: Date = new Date()) {
  if (!isApproved || !expiresAt) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  const remainingSeconds = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000);
  return Math.min(DEFAULT_SIGNED_URL_TTL_SECONDS, Math.max(0, remainingSeconds));
}

export function normalizeTrace(row: Record<string, unknown>): Trace {
  const retentionUnit = normalizeRetentionUnitFromRow(row.retention_unit ?? row.retentionUnit);
  const expiresAt = retentionUnit === "epoch" ? null : row.expires_at || row.expiresAt ? String(row.expires_at ?? row.expiresAt) : null;
  const theme = String(row.theme) as ThemeKey;
  const inferredCategory = getCategoryForTheme(theme) ?? "emotion";
  const rawCategory = row.category ?? row.trace_category ?? row.traceCategory;
  const category = isTraceCategory(rawCategory) ? rawCategory : inferredCategory;

  return {
    id: String(row.id),
    displayName: String(row.display_name ?? row.displayName ?? "Anonymous"),
    category,
    theme,
    prompt: String(row.prompt ?? ""),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    locationLabel: String(row.location_label ?? row.locationLabel ?? "Singapore"),
    audioPath: row.audio_path ? String(row.audio_path) : null,
    audioUrl: row.audio_url ? String(row.audio_url) : null,
    mimeType: row.mime_type ? String(row.mime_type) : null,
    fileSizeBytes: row.file_size_bytes === null || row.file_size_bytes === undefined ? null : Number(row.file_size_bytes),
    audioFormat: row.audio_format ? String(row.audio_format) : null,
    durationSeconds: Number(row.duration_seconds ?? row.durationSeconds ?? 0),
    retentionQuantity: normalizeRetentionQuantityFromRow(row.retention_quantity ?? row.retentionQuantity),
    retentionUnit,
    expiresAt,
    status: String(row.status ?? "pending") as TraceStatus,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

export function formatTraceDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
