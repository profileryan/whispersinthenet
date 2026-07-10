export const PRIVACY_OFFSET_MIN_METERS = 60;
export const PRIVACY_OFFSET_MAX_METERS = 100;
export const EARTH_RADIUS_METERS = 6_371_000;

export type Coordinates = { latitude: number; longitude: number };
export type RandomSource = () => number;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function getPrivacyOffsetLocation(
  origin: Coordinates,
  random: RandomSource = Math.random,
): Coordinates {
  const bearing = random() * 2 * Math.PI;
  const distance =
    PRIVACY_OFFSET_MIN_METERS +
    random() * (PRIVACY_OFFSET_MAX_METERS - PRIVACY_OFFSET_MIN_METERS);
  const angularDistance = distance / EARTH_RADIUS_METERS;

  const originLatitude = toRadians(origin.latitude);
  const originLongitude = toRadians(origin.longitude);

  const destinationLatitude = Math.asin(
    Math.sin(originLatitude) * Math.cos(angularDistance) +
      Math.cos(originLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const destinationLongitude =
    originLongitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(originLatitude),
      Math.cos(angularDistance) - Math.sin(originLatitude) * Math.sin(destinationLatitude),
    );

  return {
    latitude: toDegrees(destinationLatitude),
    longitude: ((toDegrees(destinationLongitude) + 540) % 360) - 180,
  };
}
