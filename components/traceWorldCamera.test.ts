import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  alignTargetToTerrain,
  createFocusEndpoint,
  isCameraPoseSettled,
  resolveCameraPose,
} from "./traceWorldCamera.ts";

const bounds = { minX: -18, maxX: 18, minZ: -18, maxZ: 18 };

test("resolved arrival remains identical when rebased into the first idle frame", () => {
  const target = new THREE.Vector3(2, 1.8, -3);
  const desiredCamera = new THREE.Vector3(2, 5.8, 4);
  const arrival = resolveCameraPose({
    desiredCamera,
    target,
    previousRenderedDistance: desiredCamera.distanceTo(target),
    obstructionDistance: null,
    padding: 0.65,
    minDistance: 1.5,
  });
  const idle = resolveCameraPose({
    desiredCamera: arrival.pose.camera,
    target: arrival.pose.target,
    previousRenderedDistance: arrival.renderedDistance,
    obstructionDistance: null,
    padding: 0.65,
    minDistance: 1.5,
  });

  assert.deepEqual(idle.pose.camera.toArray(), arrival.pose.camera.toArray());
  assert.deepEqual(idle.pose.target.toArray(), arrival.pose.target.toArray());
});

test("obstruction-compressed arrival remains stable after rebasing", () => {
  const target = new THREE.Vector3(0, 1.8, 0);
  const arrival = resolveCameraPose({
    desiredCamera: new THREE.Vector3(0, 5.8, 7),
    target,
    previousRenderedDistance: 8,
    obstructionDistance: 2.65,
    padding: 0.65,
    minDistance: 1.5,
    recoverImmediately: true,
  });
  const idle = resolveCameraPose({
    desiredCamera: arrival.pose.camera,
    target: arrival.pose.target,
    previousRenderedDistance: arrival.renderedDistance,
    obstructionDistance: null,
    padding: 0.65,
    minDistance: 1.5,
  });

  assert.equal(arrival.renderedDistance, 2);
  assert.deepEqual(idle.pose.camera.toArray(), arrival.pose.camera.toArray());
});

test("terrain alignment is idempotent", () => {
  const first = alignTargetToTerrain(new THREE.Vector3(4, 20, -8), 1.25, 1.8);
  const second = alignTargetToTerrain(first, 1.25, 1.8);

  assert.deepEqual(second.toArray(), first.toArray());
});

test("high and low orbs preserve cinematic endpoint composition", () => {
  const forward = new THREE.Vector3(0, 0, 1);
  const low = createFocusEndpoint({
    orbPosition: new THREE.Vector3(3, 1.3, 2),
    forward,
    surfaceHeight: 0,
    bounds,
    lookHeight: 1.8,
    distance: 7,
    minCameraHeight: 3.8,
    orbCameraClearance: 2.4,
  });
  const high = createFocusEndpoint({
    orbPosition: new THREE.Vector3(3, 5.8, 2),
    forward,
    surfaceHeight: 0,
    bounds,
    lookHeight: 1.8,
    distance: 7,
    minCameraHeight: 3.8,
    orbCameraClearance: 2.4,
  });

  assert.equal(low.camera.y, 3.8);
  assert.equal(high.camera.y, 8.2);
  assert.deepEqual(low.target.toArray(), high.target.toArray());
});

test("settled pose comparison includes position, target, and orientation", () => {
  const pose = { camera: new THREE.Vector3(0, 4, 7), target: new THREE.Vector3(0, 1.8, 0) };
  const quaternion = new THREE.Quaternion();

  assert.equal(
    isCameraPoseSettled(pose, { camera: pose.camera.clone(), target: pose.target.clone() }, quaternion, quaternion.clone(), {
      position: 0.001,
      target: 0.001,
      quaternion: 0.000001,
    }),
    true,
  );
});
