import assert from "node:assert/strict";
import test from "node:test";
import { EARTH_RADIUS_METERS, getPrivacyOffsetLocation, type Coordinates } from "./geoPrivacy.ts";

const SINGAPORE_CENTER = { latitude: 1.3521, longitude: 103.8198 };

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getDistanceMeters(a: Coordinates, b: Coordinates) {
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function randomSequence(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

function assertValidCoordinates(coordinates: Coordinates) {
  assert.ok(coordinates.latitude >= -90, `latitude ${coordinates.latitude} should be >= -90`);
  assert.ok(coordinates.latitude <= 90, `latitude ${coordinates.latitude} should be <= 90`);
  assert.ok(coordinates.longitude >= -180, `longitude ${coordinates.longitude} should be >= -180`);
  assert.ok(coordinates.longitude < 180, `longitude ${coordinates.longitude} should be < 180`);
}

test("privacy offset uses the 60 meter lower distance boundary", () => {
  const offset = getPrivacyOffsetLocation(SINGAPORE_CENTER, randomSequence([0, 0]));
  const distance = getDistanceMeters(SINGAPORE_CENTER, offset);

  assert.ok(Math.abs(distance - 60) < 0.000001, `distance ${distance} should be approximately 60m`);
});

test("privacy offset stays below 100 meters with a random distance less than 1", () => {
  const offset = getPrivacyOffsetLocation(SINGAPORE_CENTER, randomSequence([0.25, 0.999999]));
  const distance = getDistanceMeters(SINGAPORE_CENTER, offset);

  assert.ok(distance <= 100, `distance ${distance} should be at most 100m`);
  assert.ok(distance > 99.9, `distance ${distance} should be greater than 99.9m`);
});

test("different bearings move coordinates in different directions", () => {
  const north = getPrivacyOffsetLocation(SINGAPORE_CENTER, randomSequence([0, 0.5]));
  const east = getPrivacyOffsetLocation(SINGAPORE_CENTER, randomSequence([0.25, 0.5]));

  assert.notDeepEqual(north, east);
  assertValidCoordinates(north);
  assertValidCoordinates(east);
});

test("privacy offset normalizes longitude near the antimeridian", () => {
  const origin = { latitude: 0, longitude: 179.9999 };
  const offset = getPrivacyOffsetLocation(origin, randomSequence([0.25, 0.5]));

  assertValidCoordinates(offset);
  assert.ok(offset.longitude < 0, `longitude ${offset.longitude} should wrap across the antimeridian`);
});

test("generated coordinates remain valid", () => {
  for (const origin of [
    SINGAPORE_CENTER,
    { latitude: -33.8688, longitude: 151.2093 },
    { latitude: 64.1466, longitude: -21.9426 },
    { latitude: 0, longitude: -179.9999 },
  ]) {
    const offset = getPrivacyOffsetLocation(origin, randomSequence([0.75, 0.123456]));

    assertValidCoordinates(offset);
  }
});
