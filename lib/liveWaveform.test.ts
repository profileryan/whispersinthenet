import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveAmbientWaveform,
  mapFrequencyToBars,
  pushSample,
  WAVEFORM_BARS,
} from "./liveWaveform.ts";

test("WAVEFORM_BARS defines the default bar count", () => {
  assert.equal(WAVEFORM_BARS, 46);
  assert.equal(mapFrequencyToBars(new Uint8Array([128])).length, WAVEFORM_BARS);
  assert.equal(deriveAmbientWaveform("trace-1").length, WAVEFORM_BARS);
});

test("mapFrequencyToBars returns min-height bars for empty frequency buffers", () => {
  assert.deepEqual(mapFrequencyToBars(new Uint8Array(), 4, 6, 60), [6, 6, 6, 6]);
});

test("mapFrequencyToBars averages frequency buckets and scales within bounds", () => {
  const bars = mapFrequencyToBars(new Uint8Array([0, 100, 200, 255]), 2, 10, 20);

  assert.deepEqual(bars, [12, 19]);
  assert.ok(bars.every((height) => height >= 10 && height <= 20));
});

test("mapFrequencyToBars repeats the final value when the frequency buffer is shorter than the bars", () => {
  assert.deepEqual(mapFrequencyToBars(new Uint8Array([0, 255]), 5, 10, 20), [10, 20, 20, 20, 20]);
});

test("mapFrequencyToBars returns no bars for non-positive counts", () => {
  assert.deepEqual(mapFrequencyToBars(new Uint8Array([10]), 0), []);
  assert.deepEqual(mapFrequencyToBars(new Uint8Array([10]), -1), []);
});

test("deriveAmbientWaveform is deterministic for a seed and varies across seeds", () => {
  const first = deriveAmbientWaveform("trace-a", 12, 10, 62);
  const second = deriveAmbientWaveform("trace-a", 12, 10, 62);
  const different = deriveAmbientWaveform("trace-b", 12, 10, 62);

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, different);
  assert.ok(first.every((height) => height >= 10 && height <= 62));
  assert.ok(new Set(first).size > 3, "expected organic variation across bars");
});

test("deriveAmbientWaveform returns no bars for non-positive counts", () => {
  assert.deepEqual(deriveAmbientWaveform("trace", 0), []);
});

test("pushSample appends immutably and trims to capacity", () => {
  const history = [1, 2, 3];
  const next = pushSample(history, 4, 3);

  assert.deepEqual(next, [2, 3, 4]);
  assert.deepEqual(history, [1, 2, 3]);
  assert.notEqual(next, history);
});

test("pushSample handles empty and non-positive capacities", () => {
  assert.deepEqual(pushSample([], 4, 3), [4]);
  assert.deepEqual(pushSample([1, 2], 3, 0), []);
  assert.deepEqual(pushSample([1, 2], 3, -1), []);
});
