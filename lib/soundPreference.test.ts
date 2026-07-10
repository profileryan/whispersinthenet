import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSoundPreference,
  resolveInitialSound,
  SOUND_PREF_KEY,
  type SoundPreference,
} from "./soundPreference.ts";

test("SOUND_PREF_KEY uses the persisted traces sound key", () => {
  assert.equal(SOUND_PREF_KEY, "traces:sound");
});

test("parseSoundPreference accepts only on and off", () => {
  assert.equal(parseSoundPreference("on"), "on");
  assert.equal(parseSoundPreference("off"), "off");
  assert.equal(parseSoundPreference(null), null);
  assert.equal(parseSoundPreference(""), null);
  assert.equal(parseSoundPreference("ON"), null);
  assert.equal(parseSoundPreference("true"), null);
});

test("resolveInitialSound defaults missing preferences to on", () => {
  assert.equal(resolveInitialSound("on"), "on");
  assert.equal(resolveInitialSound("off"), "off");
  assert.equal(resolveInitialSound(null), "on");
});

test("SoundPreference is constrained to supported values", () => {
  const values: SoundPreference[] = ["on", "off"];

  assert.deepEqual(values, ["on", "off"]);
});
