"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getTraceTheme, isTraceFaded, type Trace } from "@/lib/traces";

type Props = {
  traces: Trace[];
  selectedTrace: Trace | null;
  now: Date;
  onSelectTrace: (trace: Trace) => void;
  onClearSelection: () => void;
};

type WorldRuntime = {
  updateOrbs: (traces: Trace[], selectedTraceId: string | null, now: Date) => void;
};

type FocusAnimation = {
  orbId: string;
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTimeMs: number;
  durationMs: number;
};

type ReleaseAnimation = {
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTimeMs: number;
  durationMs: number;
};

type TraceOrb = {
  trace: Trace;
  root: THREE.Group;
  sphere: THREE.Mesh;
  halo: THREE.Mesh;
  themeColor: THREE.Color;
  seed: number;
  position: THREE.Vector3;
  speed: number;
  floatOffset: number;
  pulseOffset: number;
  focused: boolean;
  recycleCount: number;
};

const CAMERA_FOV_DEGREES = 56;
const CAMERA_NEAR_PLANE = 0.1;
const CAMERA_FAR_PLANE = 180;
const MAX_PIXEL_RATIO = 2;
const SCENE_BACKGROUND_COLOR = "#d9d9d5";
const SCENE_FOG_COLOR = "#d7d7d2";
const SCENE_FOG_NEAR = 34;
const SCENE_FOG_FAR = 128;
const AMBIENT_LIGHT_COLOR = "#ffffff";
const AMBIENT_LIGHT_INTENSITY = 1.18;
const DIRECTIONAL_LIGHT_COLOR = "#fff7de";
const DIRECTIONAL_LIGHT_INTENSITY = 1.55;
const POINT_LIGHT_COLOR = "#ffffff";
const POINT_LIGHT_INTENSITY = 42;
const POINT_LIGHT_DISTANCE = 90;
const DEPTH_CUE_SIZE = 84;
const DEPTH_CUE_DIVISIONS = 28;
const DEPTH_CUE_Y = -9;
const DEPTH_CUE_Z = -46;
const DEPTH_CUE_OPACITY = 0.2;
const DEPTH_CUE_COLOR = "#8f969e";
const FIELD_FAR_Z = -120;
const FIELD_RECYCLE_Z = 8;
const FIELD_X_RANGE = 42;
const FIELD_Y_MIN = -14;
const FIELD_Y_MAX = 18;
const DRIFT_SPEED_MIN = 2.5;
const DRIFT_SPEED_MAX = 5.5;
const ORB_RADIUS_MIN = 0.48;
const ORB_RADIUS_MAX = 0.92;
const HALO_RADIUS_MULTIPLIER = 2.75;
const HALO_OPACITY = 0.22;
const DRIFT_LATERAL_AMPLITUDE = 0.72;
const DRIFT_VERTICAL_AMPLITUDE = 0.46;
const DRIFT_WAVE_SPEED = 0.82;
const TAP_MOVE_THRESHOLD_PX = 6;
const FOCUS_POSITION = new THREE.Vector3(0, 0, -6);
const FOCUS_DURATION_MS = 980;
const RELEASE_DURATION_MS = 1050;
const RELEASE_FIELD_Z_MIN = -36;
const RELEASE_FIELD_Z_MAX = -18;
const ORB_BASE_EMISSIVE_INTENSITY = 0.86;
const ORB_FOCUSED_EMISSIVE_INTENSITY = 2.1;
const ORB_FOCUSED_SPHERE_SCALE = 1.55;
const ORB_FOCUSED_HALO_SCALE = 1.9;
const HALO_FOCUSED_OPACITY = 0.48;
const ORB_BASE_BREATHE_AMOUNT = 0.035;
const ORB_SELECTED_PULSE_AMOUNT = 0.14;
const ORB_SELECTED_PULSE_SPEED = 4.6;
const ORB_RELEASE_WOBBLE_AMOUNT = 0.1;

export function TraceWorld({ traces, selectedTrace, now, onSelectTrace, onClearSelection }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<WorldRuntime | null>(null);
  const tracesRef = useRef(traces);
  const selectedTraceIdRef = useRef(selectedTrace?.id ?? null);
  const nowRef = useRef(now);
  const selectRef = useRef(onSelectTrace);
  const clearRef = useRef(onClearSelection);

  useEffect(() => {
    tracesRef.current = traces;
    selectedTraceIdRef.current = selectedTrace?.id ?? null;
    nowRef.current = now;
    selectRef.current = onSelectTrace;
    clearRef.current = onClearSelection;
    runtimeRef.current?.updateOrbs(traces, selectedTrace?.id ?? null, now);
  }, [now, onClearSelection, onSelectTrace, selectedTrace?.id, traces]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const stableContainer = container;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_BACKGROUND_COLOR);
    scene.fog = new THREE.Fog(SCENE_FOG_COLOR, SCENE_FOG_NEAR, SCENE_FOG_FAR);

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV_DEGREES,
      getAspectRatio(stableContainer),
      CAMERA_NEAR_PLANE,
      CAMERA_FAR_PLANE,
    );
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(stableContainer.clientWidth, stableContainer.clientHeight);
    stableContainer.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(DIRECTIONAL_LIGHT_COLOR, DIRECTIONAL_LIGHT_INTENSITY);
    directionalLight.position.set(-10, 14, 8);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(POINT_LIGHT_COLOR, POINT_LIGHT_INTENSITY, POINT_LIGHT_DISTANCE);
    pointLight.position.set(8, 6, -10);
    scene.add(pointLight);

    const depthCue = createDepthCueGrid();
    scene.add(depthCue);

    const orbGroup = new THREE.Group();
    orbGroup.name = "drifting-trace-orbs";
    scene.add(orbGroup);

    const orbsByTraceId = new Map<string, TraceOrb>();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();

    let animationFrameId: number | null = null;
    let disposed = false;
    let pointerDownPosition: { x: number; y: number } | null = null;
    let focusedOrbId: string | null = null;
    let pendingFocusOrbId: string | null = null;
    let focusAnimation: FocusAnimation | null = null;
    const releaseAnimations = new Map<string, ReleaseAnimation>();

    function renderFrame() {
      if (disposed) {
        return;
      }

      const deltaSeconds = clock.getDelta();
      const elapsedSeconds = clock.elapsedTime;
      const nowMs = performance.now();

      updateDriftingOrbs(deltaSeconds, elapsedSeconds, orbsByTraceId);
      updateFocusAnimation(performance.now());
      updateReleaseAnimations(nowMs);
      updateOrbLifeAnimation(elapsedSeconds, nowMs, orbsByTraceId, focusedOrbId, releaseAnimations);
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(renderFrame);
    }

    function focusTraceOrb(orb: TraceOrb) {
      clearRef.current();

      if (focusedOrbId && focusedOrbId !== orb.trace.id) {
        const previousOrb = orbsByTraceId.get(focusedOrbId);
        if (previousOrb) {
          releaseTraceOrb(previousOrb, releaseAnimations);
        }
      }

      focusedOrbId = orb.trace.id;
      pendingFocusOrbId = orb.trace.id;
      releaseAnimations.delete(orb.trace.id);
      orb.focused = true;
      applyFocusedOrbVisuals(orb);
      orb.position.copy(orb.root.position);
      focusAnimation = {
        orbId: orb.trace.id,
        startPosition: orb.position.clone(),
        endPosition: FOCUS_POSITION.clone(),
        startTimeMs: performance.now(),
        durationMs: FOCUS_DURATION_MS,
      };
    }

    function releaseCurrentFocusedOrb() {
      if (!focusedOrbId) {
        pendingFocusOrbId = null;
        focusAnimation = null;
        return;
      }

      const orb = orbsByTraceId.get(focusedOrbId);
      if (orb) {
        releaseTraceOrb(orb, releaseAnimations);
      }
      focusedOrbId = null;
      pendingFocusOrbId = null;
      focusAnimation = null;
    }

    function updateFocusAnimation(nowMs: number) {
      if (!focusAnimation) {
        return;
      }

      const orb = orbsByTraceId.get(focusAnimation.orbId);
      if (!orb || pendingFocusOrbId !== focusAnimation.orbId || focusedOrbId !== focusAnimation.orbId) {
        focusAnimation = null;
        return;
      }

      const progress = Math.min((nowMs - focusAnimation.startTimeMs) / focusAnimation.durationMs, 1);
      const easedProgress = easeOutBack(progress);
      orb.position.copy(focusAnimation.startPosition).lerp(focusAnimation.endPosition, easedProgress);
      orb.root.position.copy(orb.position);

      if (progress < 1) {
        return;
      }

      focusAnimation = null;
      pendingFocusOrbId = null;
      selectRef.current(orb.trace);
    }

    function updateReleaseAnimations(nowMs: number) {
      for (const [traceId, releaseAnimation] of releaseAnimations) {
        const orb = orbsByTraceId.get(traceId);
        if (!orb) {
          releaseAnimations.delete(traceId);
          continue;
        }

        const progress = Math.min((nowMs - releaseAnimation.startTimeMs) / releaseAnimation.durationMs, 1);
        const easedProgress = easeOutElastic(progress);
        const settleWave = Math.sin(progress * Math.PI * 4) * (1 - progress) * ORB_RELEASE_WOBBLE_AMOUNT;
        orb.position.copy(releaseAnimation.startPosition).lerp(releaseAnimation.endPosition, easedProgress);
        orb.position.y += settleWave;
        orb.root.position.copy(orb.position);

        if (progress < 1) {
          continue;
        }

        releaseAnimations.delete(traceId);
        orb.position.copy(releaseAnimation.endPosition);
        orb.root.position.copy(orb.position);
        orb.focused = false;
        resetTraceOrbVisuals(orb);
      }
    }

    function handleResize() {
      camera.aspect = getAspectRatio(stableContainer);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
      renderer.setSize(stableContainer.clientWidth, stableContainer.clientHeight);
    }

    function handlePointerDown(event: PointerEvent) {
      pointerDownPosition = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event: PointerEvent) {
      if (!pointerDownPosition) {
        return;
      }

      const deltaX = event.clientX - pointerDownPosition.x;
      const deltaY = event.clientY - pointerDownPosition.y;
      pointerDownPosition = null;

      if (Math.hypot(deltaX, deltaY) > TAP_MOVE_THRESHOLD_PX) {
        return;
      }

      const hitOrb = getIntersectedTraceOrb(event);
      if (hitOrb) {
        focusTraceOrb(hitOrb);
        return;
      }

      clearRef.current();
      releaseCurrentFocusedOrb();
    }

    function getIntersectedTraceOrb(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);

      const sphereMeshes = Array.from(orbsByTraceId.values())
        .filter((orb) => orb.sphere.visible && orb.root.visible)
        .map((orb) => orb.sphere);
      const intersections = raycaster.intersectObjects(sphereMeshes, false);
      const hitSphere = intersections[0]?.object;
      if (!hitSphere) {
        return null;
      }

      const traceId = hitSphere.userData.traceId;
      return typeof traceId === "string" ? (orbsByTraceId.get(traceId) ?? null) : null;
    }

    window.addEventListener("resize", handleResize);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    runtimeRef.current = {
      updateOrbs: (nextTraces, selectedTraceId, currentNow) => {
        reconcileTraceOrbs(nextTraces, orbsByTraceId, orbGroup, currentNow);
        if (focusedOrbId && !orbsByTraceId.has(focusedOrbId)) {
          releaseAnimations.delete(focusedOrbId);
          focusedOrbId = null;
          pendingFocusOrbId = null;
          focusAnimation = null;
        }
        if (selectedTraceId === null && pendingFocusOrbId === null) {
          releaseCurrentFocusedOrb();
        }
      },
    };
    runtimeRef.current.updateOrbs(tracesRef.current, selectedTraceIdRef.current, nowRef.current);
    renderFrame();

    return () => {
      disposed = true;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      if (runtimeRef.current) {
        runtimeRef.current = null;
      }
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      stableContainer.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="trace-world" ref={containerRef} aria-label="Immersive 3D trace field">
      <div className="world-caption">
        <span>TAP A TRACE TO LISTEN.</span>
      </div>
    </div>
  );
}

function getAspectRatio(container: HTMLDivElement) {
  return Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
}

function createDepthCueGrid() {
  const grid = new THREE.GridHelper(DEPTH_CUE_SIZE, DEPTH_CUE_DIVISIONS, DEPTH_CUE_COLOR, DEPTH_CUE_COLOR);
  grid.name = "non-interactive-depth-cue-grid";
  grid.position.set(0, DEPTH_CUE_Y, DEPTH_CUE_Z);
  grid.rotation.x = Math.PI * 0.08;
  grid.raycast = () => undefined;

  const material = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const entry of material) {
    entry.transparent = true;
    entry.opacity = DEPTH_CUE_OPACITY;
    entry.depthWrite = false;
  }

  return grid;
}

function reconcileTraceOrbs(
  traces: Trace[],
  orbsByTraceId: Map<string, TraceOrb>,
  orbGroup: THREE.Group,
  now: Date,
) {
  const nextTraceIds = new Set<string>();

  for (const trace of traces) {
    if (nextTraceIds.has(trace.id)) {
      continue;
    }

    nextTraceIds.add(trace.id);
    const existingOrb = orbsByTraceId.get(trace.id);
    if (existingOrb) {
      existingOrb.trace = trace;
      updateTraceOrbTheme(existingOrb, now);
      continue;
    }

    const orb = createTraceOrb(trace, traces.length, nextTraceIds.size - 1, now);
    orbsByTraceId.set(trace.id, orb);
    orbGroup.add(orb.root);
  }

  for (const [traceId, orb] of orbsByTraceId) {
    if (nextTraceIds.has(traceId)) {
      continue;
    }

    orbGroup.remove(orb.root);
    disposeObject(orb.root);
    orbsByTraceId.delete(traceId);
  }
}

function createTraceOrb(trace: Trace, traceCount: number, traceIndex: number, now: Date): TraceOrb {
  const seed = hashString(trace.id);
  const themeColor = getOrbThemeColor(trace, now);
  const radius = lerp(ORB_RADIUS_MIN, ORB_RADIUS_MAX, seededRandom(seed, 3));
  const position = createFieldPosition(seed, 0, traceCount, traceIndex);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 18),
    new THREE.MeshStandardMaterial({
      color: themeColor,
      emissive: themeColor,
      emissiveIntensity: ORB_BASE_EMISSIVE_INTENSITY,
      metalness: 0.02,
      roughness: 0.2,
    }),
  );
  sphere.name = `trace-orb-sphere-${trace.id}`;
  sphere.userData.traceId = trace.id;

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * HALO_RADIUS_MULTIPLIER, 20, 14),
    new THREE.MeshBasicMaterial({
      color: themeColor,
      transparent: true,
      opacity: HALO_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    }),
  );
  halo.name = `trace-orb-halo-${trace.id}`;
  halo.raycast = () => undefined;

  const root = new THREE.Group();
  root.name = `trace-orb-${trace.id}`;
  root.position.copy(position);
  root.add(halo, sphere);

  return {
    trace,
    root,
    sphere,
    halo,
    themeColor,
    seed,
    position,
    speed: lerp(DRIFT_SPEED_MIN, DRIFT_SPEED_MAX, seededRandom(seed, 11)),
    floatOffset: seededRandom(seed, 17) * Math.PI * 2,
    pulseOffset: seededRandom(seed, 23) * Math.PI * 2,
    focused: false,
    recycleCount: 0,
  };
}

function getOrbThemeColor(trace: Trace, now: Date) {
  const theme = getTraceTheme(trace.theme);
  const color = new THREE.Color(theme.color);
  if (isTraceFaded(trace, now)) {
    color.lerp(new THREE.Color(0x7a7a7a), 0.62);
  }
  return color;
}

function updateTraceOrbTheme(orb: TraceOrb, now: Date) {
  const nextColor = getOrbThemeColor(orb.trace, now);
  if (nextColor.equals(orb.themeColor)) {
    return;
  }

  orb.themeColor.copy(nextColor);
  const sphereMaterial = orb.sphere.material;
  if (sphereMaterial instanceof THREE.MeshStandardMaterial) {
    sphereMaterial.color.copy(nextColor);
    sphereMaterial.emissive.copy(nextColor);
  }

  const haloMaterial = orb.halo.material;
  if (haloMaterial instanceof THREE.MeshBasicMaterial) {
    haloMaterial.color.copy(nextColor);
  }
}

function updateDriftingOrbs(deltaSeconds: number, elapsedSeconds: number, orbsByTraceId: Map<string, TraceOrb>) {
  for (const orb of orbsByTraceId.values()) {
    if (orb.focused) {
      continue;
    }

    orb.position.z += orb.speed * deltaSeconds;
    if (orb.position.z > FIELD_RECYCLE_Z) {
      recycleTraceOrb(orb);
    }

    const wave = elapsedSeconds * DRIFT_WAVE_SPEED + orb.floatOffset;
    const baseX = getFieldX(orb.seed, orb.recycleCount);
    const baseY = getFieldY(orb.seed, orb.recycleCount);
    orb.position.x = baseX + Math.sin(wave + orb.seed * 0.0009) * DRIFT_LATERAL_AMPLITUDE;
    orb.position.y = baseY + Math.cos(wave * 1.17 + orb.seed * 0.0013) * DRIFT_VERTICAL_AMPLITUDE;
    orb.root.position.copy(orb.position);
  }
}

function recycleTraceOrb(orb: TraceOrb) {
  orb.recycleCount += 1;
  orb.position.set(getFieldX(orb.seed, orb.recycleCount), getFieldY(orb.seed, orb.recycleCount), FIELD_FAR_Z);
  orb.floatOffset += 0.73;
  orb.root.position.copy(orb.position);
}

function releaseTraceOrb(orb: TraceOrb, releaseAnimations: Map<string, ReleaseAnimation>) {
  orb.focused = true;
  orb.recycleCount += 1;
  resetTraceOrbVisuals(orb);
  applyFocusedOrbVisuals(orb);
  orb.position.copy(orb.root.position);
  orb.root.position.copy(orb.position);

  const endPosition = createReleaseFieldPosition(orb);
  releaseAnimations.set(orb.trace.id, {
    startPosition: orb.position.clone(),
    endPosition,
    startTimeMs: performance.now(),
    durationMs: RELEASE_DURATION_MS,
  });
}

function applyFocusedOrbVisuals(orb: TraceOrb) {
  orb.sphere.scale.setScalar(ORB_FOCUSED_SPHERE_SCALE);
  orb.halo.scale.setScalar(ORB_FOCUSED_HALO_SCALE);

  const sphereMaterial = orb.sphere.material;
  if (sphereMaterial instanceof THREE.MeshStandardMaterial) {
    sphereMaterial.emissiveIntensity = ORB_FOCUSED_EMISSIVE_INTENSITY;
  }

  const haloMaterial = orb.halo.material;
  if (haloMaterial instanceof THREE.MeshBasicMaterial) {
    haloMaterial.opacity = HALO_FOCUSED_OPACITY;
  }
}

function resetTraceOrbVisuals(orb: TraceOrb) {
  orb.sphere.scale.setScalar(1);
  orb.halo.scale.setScalar(1);

  const sphereMaterial = orb.sphere.material;
  if (sphereMaterial instanceof THREE.MeshStandardMaterial) {
    sphereMaterial.emissiveIntensity = ORB_BASE_EMISSIVE_INTENSITY;
  }

  const haloMaterial = orb.halo.material;
  if (haloMaterial instanceof THREE.MeshBasicMaterial) {
    haloMaterial.opacity = HALO_OPACITY;
  }
}

function updateOrbLifeAnimation(
  elapsedSeconds: number,
  nowMs: number,
  orbsByTraceId: Map<string, TraceOrb>,
  focusedOrbId: string | null,
  releaseAnimations: Map<string, ReleaseAnimation>,
) {
  for (const orb of orbsByTraceId.values()) {
    const releaseAnimation = releaseAnimations.get(orb.trace.id);
    if (orb.trace.id === focusedOrbId && !releaseAnimation) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * ORB_SELECTED_PULSE_SPEED + orb.pulseOffset);
      const speakingScale = ORB_FOCUSED_SPHERE_SCALE * (1 + pulse * ORB_SELECTED_PULSE_AMOUNT);
      const haloScale = ORB_FOCUSED_HALO_SCALE * (1 + pulse * ORB_SELECTED_PULSE_AMOUNT * 0.72);
      orb.sphere.scale.setScalar(speakingScale);
      orb.halo.scale.setScalar(haloScale);
      setOrbLightLevel(orb, ORB_FOCUSED_EMISSIVE_INTENSITY + pulse * 0.55, HALO_FOCUSED_OPACITY + pulse * 0.12);
      continue;
    }

    if (releaseAnimation) {
      const progress = Math.min((nowMs - releaseAnimation.startTimeMs) / releaseAnimation.durationMs, 1);
      const settleProgress = easeOutCubic(progress);
      const settleBounce = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.16;
      const sphereScale = lerp(ORB_FOCUSED_SPHERE_SCALE, 1, settleProgress) + settleBounce;
      const haloScale = lerp(ORB_FOCUSED_HALO_SCALE, 1, settleProgress) + settleBounce * 1.2;
      orb.sphere.scale.setScalar(Math.max(0.85, sphereScale));
      orb.halo.scale.setScalar(Math.max(0.9, haloScale));
      setOrbLightLevel(
        orb,
        lerp(ORB_FOCUSED_EMISSIVE_INTENSITY, ORB_BASE_EMISSIVE_INTENSITY, settleProgress),
        lerp(HALO_FOCUSED_OPACITY, HALO_OPACITY, settleProgress),
      );
      continue;
    }

    const breathe = 1 + Math.sin(elapsedSeconds * 1.45 + orb.pulseOffset) * ORB_BASE_BREATHE_AMOUNT;
    orb.sphere.scale.setScalar(breathe);
    orb.halo.scale.setScalar(1 + (breathe - 1) * 1.8);
    setOrbLightLevel(orb, ORB_BASE_EMISSIVE_INTENSITY, HALO_OPACITY);
  }
}

function setOrbLightLevel(orb: TraceOrb, emissiveIntensity: number, haloOpacity: number) {
  const sphereMaterial = orb.sphere.material;
  if (sphereMaterial instanceof THREE.MeshStandardMaterial) {
    sphereMaterial.emissiveIntensity = emissiveIntensity;
  }

  const haloMaterial = orb.halo.material;
  if (haloMaterial instanceof THREE.MeshBasicMaterial) {
    haloMaterial.opacity = haloOpacity;
  }
}

function createReleaseFieldPosition(orb: TraceOrb) {
  const releaseZ = lerp(RELEASE_FIELD_Z_MIN, RELEASE_FIELD_Z_MAX, seededRandom(orb.seed, 701 + orb.recycleCount * 53));
  return new THREE.Vector3(getFieldX(orb.seed, orb.recycleCount), getFieldY(orb.seed, orb.recycleCount), releaseZ);
}

function createFieldPosition(seed: number, recycleCount: number, traceCount: number, traceIndex: number) {
  const zSpan = FIELD_RECYCLE_Z - FIELD_FAR_Z;
  const countOffset = traceCount > 0 ? traceIndex / traceCount : 0;
  const zNoise = seededRandom(seed, 37) / Math.max(traceCount, 1);
  return new THREE.Vector3(
    getFieldX(seed, recycleCount),
    getFieldY(seed, recycleCount),
    FIELD_FAR_Z + ((countOffset + zNoise) % 1) * zSpan,
  );
}

function getFieldX(seed: number, recycleCount: number) {
  return (seededRandom(seed, 101 + recycleCount * 31) - 0.5) * FIELD_X_RANGE;
}

function getFieldY(seed: number, recycleCount: number) {
  return lerp(FIELD_Y_MIN, FIELD_Y_MAX, seededRandom(seed, 211 + recycleCount * 47));
}

function seededRandom(seed: number, salt: number) {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  const scrambled = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
  return ((scrambled ^ (scrambled >>> 16)) >>> 0) / 0x100000000;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function easeOutCubic(amount: number) {
  return 1 - (1 - amount) ** 3;
}

function easeOutBack(amount: number) {
  const overshoot = 1.55;
  const shifted = amount - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

function easeOutElastic(amount: number) {
  if (amount === 0 || amount === 1) {
    return amount;
  }

  return 2 ** (-10 * amount) * Math.sin((amount * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Points) {
      child.geometry?.dispose();
      disposeMaterial(child.material);
    }
  });

  object.clear();
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const entry of material) {
      entry.dispose();
    }
    return;
  }

  material.dispose();
}
