import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateExpiresAt,
  DEMO_TRACES,
  getBrowseThemesForCategory,
  getCategoryForTheme,
  getFadedTraceCopy,
  getLeaveThemesForCategory,
  isTraceFaded,
  isValidThemeForCategory,
  normalizeTrace,
  THEME_BY_KEY,
  THEMES,
  validateTraceSubmission,
  parseRetentionQuantityForSubmit,
  parseRetentionUnitForSubmit,
  resolveSignedUrlTtlSeconds,
  supplementTracesWithDemoFallback,
  type Trace,
} from "./traces.ts";

test("parseRetentionQuantityForSubmit accepts only integers from 1 to 99", () => {
  assert.equal(parseRetentionQuantityForSubmit("1"), 1);
  assert.equal(parseRetentionQuantityForSubmit("99"), 99);
  assert.equal(parseRetentionQuantityForSubmit(10), 10);
  assert.equal(parseRetentionQuantityForSubmit("0"), null);
  assert.equal(parseRetentionQuantityForSubmit("100"), null);
  assert.equal(parseRetentionQuantityForSubmit("1.5"), null);
  assert.equal(parseRetentionQuantityForSubmit("abc"), null);
  assert.equal(parseRetentionQuantityForSubmit(null), null);
});

test("parseRetentionUnitForSubmit accepts only known retention units", () => {
  assert.equal(parseRetentionUnitForSubmit("hour"), "hour");
  assert.equal(parseRetentionUnitForSubmit("millennium"), "millennium");
  assert.equal(parseRetentionUnitForSubmit("epoch"), "epoch");
  assert.equal(parseRetentionUnitForSubmit("banana"), null);
  assert.equal(parseRetentionUnitForSubmit(null), null);
});

test("calculateExpiresAt handles supported units", () => {
  const start = "2026-01-02T03:04:05.000Z";
  assert.equal(calculateExpiresAt(start, 2, "hour"), "2026-01-02T05:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "day"), "2026-01-04T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "week"), "2026-01-16T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "month"), "2026-03-02T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "year"), "2028-01-02T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "decade"), "2046-01-02T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "century"), "2226-01-02T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 2, "millennium"), "4026-01-02T03:04:05.000Z");
  assert.equal(calculateExpiresAt(start, 99, "epoch"), null);
});

test("normalizeTrace defaults old rows to epoch retention", () => {
  const trace = normalizeTrace({
    id: "trace-1",
    display_name: "Ada",
    theme: "hope",
    prompt: "Prompt",
    latitude: 1,
    longitude: 2,
    location_label: "Singapore",
    duration_seconds: 7,
    status: "approved",
    created_at: "2026-01-02T03:04:05.000Z",
  });

  assert.equal(trace.category, "emotion");
  assert.equal(trace.retentionQuantity, 1);
  assert.equal(trace.retentionUnit, "epoch");
  assert.equal(trace.expiresAt, null);
});


test("normalizeTrace infers confession category for legacy confession-theme rows", () => {
  const trace = normalizeTrace({
    id: "trace-confession-1",
    display_name: "Bee",
    theme: "secret",
    prompt: "Prompt",
    latitude: 1,
    longitude: 2,
    status: "approved",
    created_at: "2026-01-02T03:04:05.000Z",
  });

  assert.equal(trace.category, "confession");
  assert.equal(trace.theme, "secret");
});

test("trace category helpers validate theme/category combinations", () => {
  assert.equal(THEMES.length, 6);
  assert.equal(THEMES.some((theme) => theme.key === "secret"), false);
  assert.equal(THEME_BY_KEY.secret.label, "Secret");
  assert.deepEqual(getLeaveThemesForCategory("confession").map((theme) => theme.key), ["longing", "guilt", "pretence", "regret", "secret", "avoidance"]);
  assert.deepEqual(getBrowseThemesForCategory("confession").map((theme) => theme.key), ["longing", "guilt", "regret", "pretence", "secret", "avoidance"]);
  assert.deepEqual(getLeaveThemesForCategory("soundscape").map((theme) => theme.key), ["soundscape"]);
  assert.deepEqual(getBrowseThemesForCategory("soundscape").map((theme) => theme.key), ["soundscape"]);
  assert.equal(THEME_BY_KEY.regret.prompts.length, 1);
  assert.equal(THEME_BY_KEY.regret.prompts[0], "What is something you wish you had done differently?");
  assert.equal(THEME_BY_KEY.soundscape.prompts[0], "What do you hear around you?");
  assert.equal(getCategoryForTheme("hope"), "emotion");
  assert.equal(getCategoryForTheme("avoidance"), "confession");
  assert.equal(getCategoryForTheme("soundscape"), "soundscape");
  assert.equal(isValidThemeForCategory("hope", "emotion"), true);
  assert.equal(isValidThemeForCategory("hope", "confession"), false);
  assert.equal(isValidThemeForCategory("secret", "confession"), true);
  assert.equal(isValidThemeForCategory("soundscape", "soundscape"), true);
  assert.equal(isValidThemeForCategory("soundscape", "emotion"), false);
  assert.equal(isValidThemeForCategory("banana", "emotion"), false);
});

test("isTraceFaded changes at expiresAt boundary", () => {
  const trace = { expiresAt: "2026-01-02T03:04:05.000Z" };
  assert.equal(isTraceFaded(trace, new Date("2026-01-02T03:04:04.999Z")), false);
  assert.equal(isTraceFaded(trace, new Date("2026-01-02T03:04:05.000Z")), true);
  assert.equal(isTraceFaded(trace, new Date("2026-01-02T03:04:05.001Z")), true);
  assert.equal(isTraceFaded({ expiresAt: null }, new Date("2026-01-02T03:04:05.001Z")), false);
});

test("getFadedTraceCopy uses lowercased theme label across categories", () => {
  assert.equal(getFadedTraceCopy({ theme: "anger" } as Pick<Trace, "theme">), "There are traces of anger here.");
  assert.equal(getFadedTraceCopy({ theme: "closure" } as Pick<Trace, "theme">), "There are traces of closure here.");
  assert.equal(getFadedTraceCopy({ theme: "secret" } as Pick<Trace, "theme">), "There are traces of secret here.");
  assert.equal(getFadedTraceCopy({ theme: "soundscape" } as Pick<Trace, "theme">), "There are traces of soundscape here.");
});

test("demo traces include active and faded fallback samples across categories", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");

  for (const category of ["emotion", "confession", "soundscape"] as const) {
    for (const theme of getLeaveThemesForCategory(category)) {
      const traces = DEMO_TRACES.filter((trace) => trace.category === category && trace.theme === theme.key);

      assert.ok(traces.some((trace) => !isTraceFaded(trace, now)), `${category}/${theme.key} needs an active demo trace`);
      assert.ok(traces.some((trace) => isTraceFaded(trace, now)), `${category}/${theme.key} needs a faded demo trace`);
    }
  }
});

test("demo fallback supplements sparse live data without replacing live traces", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");
  const liveTrace = normalizeTrace({
    id: "live-hope-1",
    display_name: "Live",
    theme: "hope",
    prompt: THEME_BY_KEY.hope.prompts[0],
    latitude: 1.29,
    longitude: 103.8,
    duration_seconds: 12,
    status: "approved",
    created_at: "2026-06-08T12:00:00.000Z",
  });
  const supplemented = supplementTracesWithDemoFallback([liveTrace], now);

  assert.equal(supplemented[0].id, "live-hope-1");
  assert.equal(supplemented.filter((trace) => trace.id === "live-hope-1").length, 1);
  assert.ok(supplemented.some((trace) => trace.category === "confession"));
  assert.ok(supplemented.some((trace) => trace.category === "soundscape"));
  assert.ok(supplemented.some((trace) => trace.category === "emotion" && isTraceFaded(trace, now)));
  assert.ok(supplemented.some((trace) => trace.category === "confession" && isTraceFaded(trace, now)));
  assert.ok(supplemented.some((trace) => trace.category === "soundscape" && isTraceFaded(trace, now)));
});

test("resolveSignedUrlTtlSeconds caps public approved URLs to remaining lifetime", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(resolveSignedUrlTtlSeconds(null, true, now), 1200);
  assert.equal(resolveSignedUrlTtlSeconds("2026-01-01T00:00:10.000Z", false, now), 1200);
  assert.equal(resolveSignedUrlTtlSeconds("2026-01-01T00:00:10.000Z", true, now), 10);
  assert.equal(resolveSignedUrlTtlSeconds("2026-01-01T01:00:00.000Z", true, now), 1200);
  assert.equal(resolveSignedUrlTtlSeconds("2025-12-31T23:59:59.000Z", true, now), 0);
});

test("validateTraceSubmission accepts valid emotion and confession submissions", () => {
  const emotion = validateTraceSubmission({
    displayName: " Ada ",
    theme: "hope",
    prompt: THEME_BY_KEY.hope.prompts[0],
    latitude: "1.2",
    longitude: "103.8",
    durationSeconds: "12",
    retentionQuantity: "1",
    retentionUnit: "epoch",
  });
  assert.equal(emotion.ok, true);
  if (emotion.ok) {
    assert.equal(emotion.data.category, "emotion");
    assert.equal(emotion.data.displayName, "Ada");
  }

  const confession = validateTraceSubmission({
    displayName: "Cy",
    category: "confession",
    theme: "secret",
    prompt: THEME_BY_KEY.secret.prompts[0],
    latitude: 1.2,
    longitude: 103.8,
    durationSeconds: 12,
    retentionQuantity: 1,
    retentionUnit: "day",
  });
  assert.equal(confession.ok, true);
  if (confession.ok) {
    assert.equal(confession.data.category, "confession");
    assert.equal(confession.data.theme, "secret");
  }

  const soundscape = validateTraceSubmission({
    displayName: "Field",
    category: "soundscape",
    theme: "soundscape",
    prompt: THEME_BY_KEY.soundscape.prompts[0],
    latitude: 1.2,
    longitude: 103.8,
    durationSeconds: 12,
    retentionQuantity: 1,
    retentionUnit: "day",
  });
  assert.equal(soundscape.ok, true);
  if (soundscape.ok) {
    assert.equal(soundscape.data.category, "soundscape");
    assert.equal(soundscape.data.theme, "soundscape");
  }
});

test("validateTraceSubmission rejects mismatched category, prompt, and retention", () => {
  assert.equal(
    validateTraceSubmission({
      displayName: "Ada",
      category: "emotion",
      theme: "secret",
      prompt: THEME_BY_KEY.secret.prompts[0],
      latitude: 1,
      longitude: 2,
      durationSeconds: 1,
      retentionQuantity: 1,
      retentionUnit: "epoch",
    }).ok,
    false,
  );

  assert.equal(
    validateTraceSubmission({
      displayName: "Ada",
      theme: "hope",
      prompt: THEME_BY_KEY.joy.prompts[0],
      latitude: 1,
      longitude: 2,
      durationSeconds: 1,
      retentionQuantity: 1,
      retentionUnit: "epoch",
    }).ok,
    false,
  );

  assert.equal(
    validateTraceSubmission({
      displayName: "Ada",
      category: "banana",
      theme: "hope",
      prompt: THEME_BY_KEY.hope.prompts[0],
      latitude: 1,
      longitude: 2,
      durationSeconds: 1,
      retentionQuantity: 1,
      retentionUnit: "epoch",
    }).ok,
    false,
  );

  assert.deepEqual(
    validateTraceSubmission({
      displayName: "Ada",
      theme: "hope",
      prompt: THEME_BY_KEY.hope.prompts[0],
      latitude: 1,
      longitude: 2,
      durationSeconds: 1,
      retentionQuantity: 0,
      retentionUnit: "epoch",
    }),
    { ok: false, error: "Choose how long this trace should remain." },
  );
});
