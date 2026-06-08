import assert from "node:assert/strict";
import test from "node:test";
import { getDesktopMarkerPoint, getMobileMarkerPoint, getTraceMapMarkerPoint } from "./traceMapPlacement.ts";

function assertClose(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should be close to ${expected}`);
}

test("desktop placement centers the selected marker in the map frame", () => {
  const point = getDesktopMarkerPoint(1200, 600);

  assert.deepEqual(point, { x: 600, y: 312 });
});

test("tablet placement keeps the selected marker centered", () => {
  const point = getDesktopMarkerPoint(720, 520);

  assertClose(point.x, 360);
  assertClose(point.y, 270.4);
});

test("mobile placement centers the marker below the top panel", () => {
  const point = getMobileMarkerPoint(390, 640);

  assert.equal(point.x, 195);
  assertClose(point.y, 318);
});

test("mobile placement keeps the marker inside short stages", () => {
  const point = getMobileMarkerPoint(320, 360);

  assert.equal(point.x, 160);
  assertClose(point.y, 287.2);
});

test("combined helper owns the mobile breakpoint", () => {
  assert.deepEqual(getTraceMapMarkerPoint(719, 640), getMobileMarkerPoint(719, 640));
  assert.deepEqual(getTraceMapMarkerPoint(720, 640), getDesktopMarkerPoint(720, 640));
});
