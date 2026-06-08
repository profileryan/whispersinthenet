import * as THREE from "three";
import type { RoomBounds } from "@/components/traceWorldNavigation";

export type CameraPose = {
  camera: THREE.Vector3;
  target: THREE.Vector3;
};

type ResolveCameraPoseOptions = {
  desiredCamera: THREE.Vector3;
  target: THREE.Vector3;
  previousRenderedDistance: number;
  obstructionDistance: number | null;
  padding: number;
  minDistance: number;
  recoveryFactor?: number;
  recoverImmediately?: boolean;
};

type FocusEndpointOptions = {
  orbPosition: THREE.Vector3;
  forward: THREE.Vector3;
  surfaceHeight: number;
  bounds: RoomBounds;
  lookHeight: number;
  distance: number;
  minCameraHeight: number;
  orbCameraClearance: number;
};

export type CameraPoseTolerance = {
  position: number;
  target: number;
  quaternion: number;
};

export function resolveCameraPose({
  desiredCamera,
  target,
  previousRenderedDistance,
  obstructionDistance,
  padding,
  minDistance,
  recoveryFactor = 0.16,
  recoverImmediately = false,
}: ResolveCameraPoseOptions) {
  const offset = desiredCamera.clone().sub(target);
  const desiredDistance = offset.length();
  if (!desiredDistance) {
    return {
      pose: { camera: target.clone(), target: target.clone() },
      desiredDistance,
      allowedDistance: 0,
      renderedDistance: 0,
    };
  }

  const allowedDistance =
    obstructionDistance === null ? desiredDistance : Math.max(minDistance, obstructionDistance - padding);
  const renderedDistance = Math.min(
    desiredDistance,
    recoverImmediately || allowedDistance < previousRenderedDistance
      ? allowedDistance
      : THREE.MathUtils.lerp(previousRenderedDistance, allowedDistance, recoveryFactor),
  );

  return {
    pose: {
      camera: target.clone().addScaledVector(offset.normalize(), renderedDistance),
      target: target.clone(),
    },
    desiredDistance,
    allowedDistance,
    renderedDistance,
  };
}

export function createFocusEndpoint({
  orbPosition,
  forward,
  surfaceHeight,
  bounds,
  lookHeight,
  distance,
  minCameraHeight,
  orbCameraClearance,
}: FocusEndpointOptions): CameraPose {
  const target = new THREE.Vector3(orbPosition.x, surfaceHeight + lookHeight, orbPosition.z);
  const camera = orbPosition.clone().addScaledVector(forward, distance);
  camera.y = Math.max(surfaceHeight + minCameraHeight, orbPosition.y + orbCameraClearance);
  camera.x = THREE.MathUtils.clamp(camera.x, bounds.minX, bounds.maxX);
  camera.z = THREE.MathUtils.clamp(camera.z, bounds.minZ, bounds.maxZ);
  return { camera, target };
}

export function alignTargetToTerrain(target: THREE.Vector3, surfaceHeight: number, lookHeight: number) {
  return new THREE.Vector3(target.x, surfaceHeight + lookHeight, target.z);
}

export function isCameraPoseSettled(
  previousPose: CameraPose,
  currentPose: CameraPose,
  previousQuaternion: THREE.Quaternion,
  currentQuaternion: THREE.Quaternion,
  tolerance: CameraPoseTolerance,
) {
  return (
    previousPose.camera.distanceTo(currentPose.camera) <= tolerance.position &&
    previousPose.target.distanceTo(currentPose.target) <= tolerance.target &&
    1 - Math.abs(previousQuaternion.dot(currentQuaternion)) <= tolerance.quaternion
  );
}
