"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  buildNavigationGrid,
  clampPoint,
  findNavigationPath,
  insetBounds,
  isPointBlocked,
  isValidWorldPosition,
  movePointWithCollisions,
  type RoomBounds,
} from "@/components/traceWorldNavigation";
import {
  alignTargetToTerrain,
  createFocusEndpoint,
  isCameraPoseSettled,
  resolveCameraPose,
  type CameraPose,
} from "@/components/traceWorldCamera";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getTraceTheme, isTraceFaded, type Trace } from "@/lib/traces";

type Props = {
  traces: Trace[];
  selectedTrace: Trace | null;
  now: Date;
  onSelectTrace: (trace: Trace) => void;
  onClearSelection: () => void;
};

type OrbPlacement = {
  trace: Trace;
  position: THREE.Vector3;
};

type FocusAnimation = {
  startedAt: number;
  trace: Trace;
  fromCamera: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toCamera: THREE.Vector3;
  toTarget: THREE.Vector3;
};

type VisitorPayload = {
  sessionId: string;
  colorIndex: number;
  x: number;
  z: number;
};

type RemoteLight = {
  root: THREE.Group;
  target: THREE.Vector3;
};

type WorldRuntime = {
  updateOrbs: (traces: Trace[], selectedTraceId: string | null, now: Date) => void;
};

type PendingTraceReveal = {
  trace: Trace;
  startedAt: number;
  previousPose: CameraPose | null;
  previousQuaternion: THREE.Quaternion | null;
  stableFrames: number;
};

type CameraDebugSample = {
  at: number;
  stage: string;
  camera: number[];
  target: number[];
  yaw: number;
  pitch: number;
  distance: number;
  terrainHeight: number;
  desiredOffset: number[];
  obstructionDistance: number | null;
  container: { width: number; height: number };
  panelVisible: boolean;
  controlsEnabled: boolean;
  focusActive: boolean;
  revealStableFrames: number | null;
};

type CameraDebugApi = {
  samples: CameraDebugSample[];
  clear: () => void;
};

const DEFAULT_ROOM_BOUNDS: RoomBounds = {
  minX: -18,
  maxX: 18,
  minZ: -18,
  maxZ: 18,
};
const DEFAULT_FLOOR_Y = -1.6;
const WALL_INSET = 3;
const ORB_CLEARANCE = 1.5;
const ORB_SPACING = 3.2;
const WALK_SPEED = 12;
const AUTO_TRAVEL_SPEED = 15;
const LOOK_HEIGHT = 1.8;
const VISITOR_LIGHT_HEIGHT = 1.45;
const FOCUS_DURATION_MS = 850;
const CAMERA_PADDING = 0.65;
const CAMERA_MIN_DISTANCE = 1.5;
const CAMERA_SETTLED_FALLBACK_MS = 250;
const CAMERA_SETTLED_REQUIRED_FRAMES = 2;
const CAMERA_SETTLED_TOLERANCE = {
  position: 0.001,
  target: 0.001,
  quaternion: 0.000001,
};
const CAMERA_DEBUG_CAPTURE_AFTER_ARRIVAL_MS = 500;
const CAMERA_DEBUG_MAX_SAMPLES = 360;
const MOVEMENT_BROADCAST_INTERVAL_MS = 120;
const SETTLED_PRESENCE_DELAY_MS = 550;
const VISITOR_COLORS = ["#f8ffb8", "#b8f6ff", "#d8b8ff", "#ffcfb8", "#b8ffd1", "#fff0b8"];
const WORLD_BACKGROUND_COLOR = "#EFEFEF";

export function TraceWorld({ traces, selectedTrace, now, onSelectTrace, onClearSelection }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<WorldRuntime | null>(null);
  const tracesRef = useRef(traces);
  const nowRef = useRef(now);
  const selectedTraceIdRef = useRef(selectedTrace?.id ?? null);
  const selectRef = useRef(onSelectTrace);
  const clearRef = useRef(onClearSelection);

  useEffect(() => {
    tracesRef.current = traces;
    nowRef.current = now;
    selectedTraceIdRef.current = selectedTrace?.id ?? null;
    selectRef.current = onSelectTrace;
    clearRef.current = onClearSelection;
    runtimeRef.current?.updateOrbs(traces, selectedTrace?.id ?? null, now);
  }, [now, onClearSelection, onSelectTrace, selectedTrace?.id, traces]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(WORLD_BACKGROUND_COLOR);
    scene.fog = new THREE.Fog(WORLD_BACKGROUND_COLOR, 18, 46);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 320);
    camera.position.set(0, 6, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = CAMERA_MIN_DISTANCE;
    controls.maxDistance = 28;
    controls.maxPolarAngle = Math.PI * 0.82;

    scene.add(new THREE.AmbientLight("#ffffff", 1.4));
    const keyLight = new THREE.PointLight("#ffffff", 160, 180);
    keyLight.position.set(5, 12, 8);
    scene.add(keyLight);

    const environmentGroup = new THREE.Group();
    const orbGroup = new THREE.Group();
    const visitorGroup = new THREE.Group();
    scene.add(environmentGroup, orbGroup, visitorGroup);

    const pointerRaycaster = new THREE.Raycaster();
    const surfaceRaycaster = new THREE.Raycaster();
    const cameraRaycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const down = new THREE.Vector3(0, -1, 0);
    const meshToTrace = new Map<THREE.Object3D, Trace>();
    const tracePositions = new Map<string, THREE.Vector3>();
    const remoteLights = new Map<string, RemoteLight>();
    const activeRemoteSessions = new Set<string>();
    const pressedKeys = new Set<string>();
    const clock = new THREE.Clock();
    const movement = new THREE.Vector3();
    const movement2d = new THREE.Vector2();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const desiredCameraOffset = camera.position.clone().sub(controls.target);
    const desiredCamera = new THREE.Vector3();
    const previousTarget = new THREE.Vector3();
    const sessionId = createSessionId();
    const colorIndex = hashString(sessionId) % VISITOR_COLORS.length;
    const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    let roomBounds = DEFAULT_ROOM_BOUNDS;
    let navigationBounds = insetBounds(DEFAULT_ROOM_BOUNDS, WALL_INSET);
    let navigationGrid = buildNavigationGrid(navigationBounds, []);
    let floorY = DEFAULT_FLOOR_Y;
    let blockers: RoomBounds[] = [];
    let walkableMeshes: THREE.Mesh[] = [];
    let cameraObstructionMeshes: THREE.Mesh[] = [];
    let focusAnimation: FocusAnimation | null = null;
    let autoTravelPath: THREE.Vector2[] = [];
    let pointerStart: { x: number; y: number } | null = null;
    let renderedCameraDistance = desiredCameraOffset.length();
    let disposed = false;
    let fallbackGrid: THREE.GridHelper | null = null;
    let visitorChannel: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>["channel"]> | null = null;
    let visitorChannelReady = false;
    let lastMovementBroadcastAt = 0;
    let settledPresenceTimer: number | null = null;
    let pendingTraceReveal: PendingTraceReveal | null = null;
    let cameraDebugCaptureUntil = 0;
    let cameraDebugCapturing = false;
    let cameraDebugOverlay: HTMLPreElement | null = null;
    const cameraDebugEnabled = new URLSearchParams(window.location.search).get("cameraDebug") === "1";
    const cameraDebugSamples: CameraDebugSample[] = [];
    const lastAnnouncedPosition = new THREE.Vector2(Number.NaN, Number.NaN);

    if (cameraDebugEnabled) {
      const debugWindow = window as typeof window & { __tracesCameraDebug?: CameraDebugApi };
      cameraDebugOverlay = document.createElement("pre");
      cameraDebugOverlay.className = "camera-debug-overlay";
      container.appendChild(cameraDebugOverlay);
      debugWindow.__tracesCameraDebug = {
        samples: cameraDebugSamples,
        clear: () => {
          cameraDebugSamples.length = 0;
          renderCameraDebugOverlay();
        },
      };
      renderCameraDebugOverlay();
    }

    function startCameraDebugCapture() {
      if (!cameraDebugEnabled) {
        return;
      }
      cameraDebugSamples.length = 0;
      cameraDebugCapturing = true;
      cameraDebugCaptureUntil = Number.POSITIVE_INFINITY;
    }

    function finishCameraDebugCapture(now: number) {
      if (cameraDebugEnabled) {
        cameraDebugCaptureUntil = now + CAMERA_DEBUG_CAPTURE_AFTER_ARRIVAL_MS;
      }
    }

    function recordCameraDebug(stage: string, obstructionDistance: number | null = null) {
      if (!cameraDebugEnabled || !cameraDebugCapturing) {
        return;
      }
      const now = performance.now();
      if (now > cameraDebugCaptureUntil) {
        cameraDebugCapturing = false;
        renderCameraDebugOverlay();
        return;
      }
      const sample: CameraDebugSample = {
        at: now,
        stage,
        camera: roundVector(camera.position),
        target: roundVector(controls.target),
        yaw: roundNumber(camera.rotation.y),
        pitch: roundNumber(camera.rotation.x),
        distance: roundNumber(camera.position.distanceTo(controls.target)),
        terrainHeight: roundNumber(resolveSurfaceHeight(controls.target.x, controls.target.z)),
        desiredOffset: roundVector(desiredCameraOffset),
        obstructionDistance: obstructionDistance === null ? null : roundNumber(obstructionDistance),
        container: { width: container?.clientWidth ?? 0, height: container?.clientHeight ?? 0 },
        panelVisible: Boolean(container?.parentElement?.querySelector(".listening-panel")),
        controlsEnabled: controls.enabled,
        focusActive: Boolean(focusAnimation),
        revealStableFrames: pendingTraceReveal?.stableFrames ?? null,
      };
      cameraDebugSamples.push(sample);
      if (cameraDebugSamples.length > CAMERA_DEBUG_MAX_SAMPLES) {
        cameraDebugSamples.shift();
      }
      renderCameraDebugOverlay();
    }

    function renderCameraDebugOverlay() {
      if (!cameraDebugOverlay) {
        return;
      }
      const latest = cameraDebugSamples[cameraDebugSamples.length - 1];
      cameraDebugOverlay.textContent = latest
        ? [
            `CAMERA DEBUG ${cameraDebugCapturing ? "CAPTURING" : "READY"}`,
            `${latest.stage} @ ${latest.at.toFixed(1)}ms`,
            `cam ${latest.camera.join(", ")}`,
            `target ${latest.target.join(", ")}`,
            `yaw ${latest.yaw} pitch ${latest.pitch} dist ${latest.distance}`,
            `terrain ${latest.terrainHeight} obstruction ${latest.obstructionDistance ?? "none"}`,
            `size ${latest.container.width}x${latest.container.height} panel ${latest.panelVisible ? "yes" : "no"}`,
            `controls ${latest.controlsEnabled ? "on" : "off"} stable ${latest.revealStableFrames ?? "-"}`,
            `samples ${cameraDebugSamples.length}`,
          ].join("\n")
        : "CAMERA DEBUG READY\nTap an orb to capture.";
    }

    function addFallbackGrid() {
      if (fallbackGrid) {
        return;
      }
      fallbackGrid = new THREE.GridHelper(42, 22, "#111111", "#9a9a9a");
      fallbackGrid.position.y = DEFAULT_FLOOR_Y;
      scene.add(fallbackGrid);
    }

    function setDefaultRoom() {
      roomBounds = DEFAULT_ROOM_BOUNDS;
      navigationBounds = insetBounds(roomBounds, WALL_INSET);
      navigationGrid = buildNavigationGrid(navigationBounds, []);
      floorY = DEFAULT_FLOOR_Y;
      blockers = [];
      walkableMeshes = [];
      cameraObstructionMeshes = [];
      scene.fog = new THREE.Fog(WORLD_BACKGROUND_COLOR, 18, 46);
      addFallbackGrid();
    }

    function applyRoomMetadata(root: THREE.Object3D) {
      const walls = root.getObjectByName("Walls");
      const floor = root.getObjectByName("Floor");
      if (!walls || !floor) {
        setDefaultRoom();
        return;
      }

      root.updateMatrixWorld(true);
      const wallBox = new THREE.Box3().setFromObject(walls);
      const floorBox = new THREE.Box3().setFromObject(floor);
      if (wallBox.isEmpty() || floorBox.isEmpty()) {
        setDefaultRoom();
        return;
      }

      roomBounds = {
        minX: wallBox.min.x,
        maxX: wallBox.max.x,
        minZ: wallBox.min.z,
        maxZ: wallBox.max.z,
      };
      navigationBounds = insetBounds(roomBounds, WALL_INSET);
      floorY = floorBox.max.y;
      blockers = collectBounds(root, ["Rack", "Pillars"]);
      navigationGrid = buildNavigationGrid(navigationBounds, blockers);
      walkableMeshes = collectMeshes(root, ["Floor", "Landscape"]);
      cameraObstructionMeshes = collectMeshes(root, ["Walls", "Rack", "Pillars", "Landscape"]);

      const roomDiagonal = Math.hypot(roomBounds.maxX - roomBounds.minX, roomBounds.maxZ - roomBounds.minZ);
      scene.fog = new THREE.Fog(WORLD_BACKGROUND_COLOR, Math.max(18, roomDiagonal * 0.32), Math.max(46, roomDiagonal * 1.05));
      const clampedTarget = clampPoint(new THREE.Vector2(controls.target.x, controls.target.z), navigationBounds);
      controls.target.x = clampedTarget.x;
      controls.target.z = clampedTarget.y;
      syncRigTerrainHeight();
      announceLocalMovement(true);
    }

    function resolveSurfaceHeight(x: number, z: number) {
      if (!walkableMeshes.length) {
        return floorY;
      }
      surfaceRaycaster.set(new THREE.Vector3(x, 180, z), down);
      const hit = surfaceRaycaster.intersectObjects(walkableMeshes, false)[0];
      return hit?.point.y ?? floorY;
    }

    function syncRigTerrainHeight() {
      controls.target.copy(
        alignTargetToTerrain(controls.target, resolveSurfaceHeight(controls.target.x, controls.target.z), LOOK_HEIGHT),
      );
      recordCameraDebug("terrain-sync");
    }

    function updateOrbs(nextTraces: Trace[], selectedTraceId: string | null, currentNow: Date) {
      disposeChildren(orbGroup);
      meshToTrace.clear();
      tracePositions.clear();

      const placements = scatterOrbs(nextTraces, navigationBounds, floorY, blockers, resolveSurfaceHeight);
      placements.forEach(({ trace, position }, index) => {
        const theme = getTraceTheme(trace.theme);
        const selected = selectedTraceId === trace.id;
        const faded = isTraceFaded(trace, currentNow);
        const color = faded ? "#9b9b9b" : theme.color;

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(faded ? (selected ? 0.42 : 0.32) : selected ? 0.62 : 0.48, 32, 32),
          new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: faded ? (selected ? 0.42 : 0.22) : selected ? 1.35 : 0.85,
            roughness: faded ? 0.82 : 0.35,
          }),
        );
        sphere.position.copy(position);
        sphere.userData.baseY = position.y;
        sphere.userData.floatOffset = index * 0.7;
        orbGroup.add(sphere);
        meshToTrace.set(sphere, trace);
        tracePositions.set(trace.id, position.clone());

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(faded ? (selected ? 0.82 : 0.64) : selected ? 1.25 : 1, 32, 32),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: faded ? (selected ? 0.08 : 0.04) : selected ? 0.2 : 0.11,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        halo.position.copy(position);
        halo.userData.baseY = position.y;
        halo.userData.floatOffset = index * 0.7;
        orbGroup.add(halo);
      });
    }

    function moveRig(deltaX: number, deltaZ: number) {
      const start = new THREE.Vector2(controls.target.x, controls.target.z);
      const next = movePointWithCollisions(start, movement2d.set(deltaX, deltaZ), navigationBounds, blockers);
      controls.target.x = next.x;
      controls.target.z = next.y;
      return !next.equals(start);
    }

    function startAutoTravel(destination: THREE.Vector3) {
      const path = findNavigationPath(
        navigationGrid,
        new THREE.Vector2(controls.target.x, controls.target.z),
        new THREE.Vector2(destination.x, destination.z),
      );
      if (!path.length) {
        return;
      }
      autoTravelPath = path;
      cancelFocus();
      clearRef.current();
    }

    function advanceAutoTravel(deltaSeconds: number) {
      const waypoint = autoTravelPath[0];
      if (!waypoint) {
        return;
      }
      const current = new THREE.Vector2(controls.target.x, controls.target.z);
      const delta = waypoint.clone().sub(current);
      const stepDistance = AUTO_TRAVEL_SPEED * deltaSeconds;
      if (delta.length() <= stepDistance) {
        if (moveRig(delta.x, delta.y)) {
          autoTravelPath.shift();
        } else {
          autoTravelPath = [];
        }
        return;
      }
      delta.setLength(stepDistance);
      if (!moveRig(delta.x, delta.y)) {
        autoTravelPath = [];
      }
    }

    function focusOnTrace(trace: Trace) {
      const position = tracePositions.get(trace.id);
      if (!position) {
        return;
      }

      startCameraDebugCapture();
      cancelPendingTraceReveal();
      autoTravelPath = [];
      clearRef.current();
      drainControlsInputPreservingPose();
      controls.enabled = false;
      forward.subVectors(camera.position, controls.target);
      forward.y = 0;
      if (forward.lengthSq() < 0.001) {
        forward.set(0, 0, 1);
      } else {
        forward.normalize();
      }

      const endpoint = createFocusEndpoint({
        orbPosition: position,
        forward,
        surfaceHeight: resolveSurfaceHeight(position.x, position.z),
        bounds: navigationBounds,
        lookHeight: LOOK_HEIGHT,
        distance: 7,
        minCameraHeight: 3.8,
        orbCameraClearance: 2.4,
      });
      focusAnimation = {
        startedAt: performance.now(),
        trace,
        fromCamera: camera.position.clone(),
        fromTarget: controls.target.clone(),
        toCamera: endpoint.camera,
        toTarget: endpoint.target,
      };
      recordCameraDebug("focus");
    }

    function cancelFocus() {
      focusAnimation = null;
      controls.enabled = true;
      cancelPendingTraceReveal();
    }

    function cancelPendingTraceReveal() {
      pendingTraceReveal = null;
    }

    function waitToRevealTrace(trace: Trace, now: number) {
      cancelPendingTraceReveal();
      pendingTraceReveal = {
        trace,
        startedAt: now,
        previousPose: null,
        previousQuaternion: null,
        stableFrames: 0,
      };
      finishCameraDebugCapture(now);
    }

    function revealTraceWhenCameraSettles(now: number) {
      if (!pendingTraceReveal) {
        return;
      }
      const currentPose = getRenderedCameraPose();
      const currentQuaternion = camera.quaternion.clone();
      if (
        pendingTraceReveal.previousPose &&
        pendingTraceReveal.previousQuaternion &&
        isCameraPoseSettled(
          pendingTraceReveal.previousPose,
          currentPose,
          pendingTraceReveal.previousQuaternion,
          currentQuaternion,
          CAMERA_SETTLED_TOLERANCE,
        )
      ) {
        pendingTraceReveal.stableFrames += 1;
      } else {
        pendingTraceReveal.stableFrames = 0;
      }
      pendingTraceReveal.previousPose = currentPose;
      pendingTraceReveal.previousQuaternion = currentQuaternion;

      const elapsed = now - pendingTraceReveal.startedAt;
      if (
        pendingTraceReveal.stableFrames >= CAMERA_SETTLED_REQUIRED_FRAMES ||
        elapsed >= CAMERA_SETTLED_FALLBACK_MS
      ) {
        if (cameraDebugEnabled && elapsed >= CAMERA_SETTLED_FALLBACK_MS) {
          console.warn("Camera did not settle before the trace panel fallback timer elapsed.");
        }
        const { trace } = pendingTraceReveal;
        recordCameraDebug("panel-reveal");
        pendingTraceReveal = null;
        selectRef.current(trace);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      pointerStart = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event: PointerEvent) {
      if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) {
        pointerStart = null;
        return;
      }
      pointerStart = null;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerRaycaster.setFromCamera(pointer, camera);
      const orbHits = pointerRaycaster.intersectObjects(Array.from(meshToTrace.keys()), false);
      const trace = orbHits[0] ? meshToTrace.get(orbHits[0].object) : null;
      if (trace) {
        focusOnTrace(trace);
        return;
      }

      if (hasCoarsePointer) {
        const surfaceHit = pointerRaycaster.intersectObjects(walkableMeshes, false)[0];
        if (surfaceHit) {
          startAutoTravel(surfaceHit.point);
          return;
        }
      }
      clearRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) {
        return;
      }
      event.preventDefault();
      pressedKeys.add(key);
      autoTravelPath = [];
      cancelFocus();
    }

    function handleKeyUp(event: KeyboardEvent) {
      pressedKeys.delete(event.key.toLowerCase());
    }

    function handleResize() {
      if (!container) {
        return;
      }
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function addRemoteLight(payload: VisitorPayload) {
      const existing = remoteLights.get(payload.sessionId);
      const target = new THREE.Vector3(payload.x, resolveSurfaceHeight(payload.x, payload.z) + VISITOR_LIGHT_HEIGHT, payload.z);
      if (existing) {
        existing.target.copy(target);
        return;
      }

      const color = VISITOR_COLORS[payload.colorIndex % VISITOR_COLORS.length];
      const root = new THREE.Group();
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 20, 20),
        new THREE.MeshBasicMaterial({ color }),
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 20, 20),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      root.add(light, halo);
      root.position.copy(target);
      visitorGroup.add(root);
      remoteLights.set(payload.sessionId, { root, target });
    }

    function removeRemoteLight(remoteSessionId: string) {
      const remote = remoteLights.get(remoteSessionId);
      if (!remote) {
        return;
      }
      disposeChildren(remote.root);
      visitorGroup.remove(remote.root);
      remoteLights.delete(remoteSessionId);
    }

    function syncRemotePresence() {
      if (!visitorChannel) {
        return;
      }
      activeRemoteSessions.clear();
      Object.values(visitorChannel.presenceState<VisitorPayload>())
        .flat()
        .forEach((presence) => {
          const payload = parseVisitorPayload(presence, navigationBounds, blockers);
          if (!payload || payload.sessionId === sessionId) {
            return;
          }
          activeRemoteSessions.add(payload.sessionId);
          addRemoteLight(payload);
        });

      [...remoteLights.keys()].forEach((remoteSessionId) => {
        if (!activeRemoteSessions.has(remoteSessionId)) {
          removeRemoteLight(remoteSessionId);
        }
      });
    }

    function trackLocalPresence() {
      if (!visitorChannelReady || !visitorChannel) {
        return;
      }
      void visitorChannel.track(createLocalVisitorPayload());
    }

    function createLocalVisitorPayload(): VisitorPayload {
      return {
        sessionId,
        colorIndex,
        x: controls.target.x,
        z: controls.target.z,
      };
    }

    function announceLocalMovement(forcePresence = false) {
      if (!visitorChannelReady || !visitorChannel) {
        return;
      }
      const position = new THREE.Vector2(controls.target.x, controls.target.z);
      if (!forcePresence && position.distanceTo(lastAnnouncedPosition) < 0.08) {
        return;
      }
      lastAnnouncedPosition.copy(position);
      const now = performance.now();
      if (now - lastMovementBroadcastAt >= MOVEMENT_BROADCAST_INTERVAL_MS) {
        lastMovementBroadcastAt = now;
        void visitorChannel.send({
          type: "broadcast",
          event: "visitor-move",
          payload: createLocalVisitorPayload(),
        });
      }
      if (settledPresenceTimer) {
        window.clearTimeout(settledPresenceTimer);
      }
      settledPresenceTimer = window.setTimeout(trackLocalPresence, forcePresence ? 0 : SETTLED_PRESENCE_DELAY_MS);
    }

    function startVisitorChannel() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        return;
      }

      visitorChannel = supabase
        .channel("room:immersive:visitors", {
          config: {
            broadcast: { self: false },
            presence: { key: sessionId, enabled: true },
          },
        })
        .on("presence", { event: "sync" }, syncRemotePresence)
        .on("broadcast", { event: "visitor-move" }, ({ payload }) => {
          const visitor = parseVisitorPayload(payload, navigationBounds, blockers);
          if (!visitor || visitor.sessionId === sessionId || !activeRemoteSessions.has(visitor.sessionId)) {
            return;
          }
          addRemoteLight(visitor);
        })
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") {
            return;
          }
          visitorChannelReady = true;
          trackLocalPresence();
        });
    }

    function readCameraObstructionDistance(target: THREE.Vector3, cameraPosition: THREE.Vector3) {
      const offset = cameraPosition.clone().sub(target);
      const desiredDistance = offset.length();
      if (!desiredDistance) {
        return null;
      }
      const direction = offset.normalize();
      if (cameraObstructionMeshes.length) {
        cameraRaycaster.set(target, direction);
        cameraRaycaster.near = 0.4;
        cameraRaycaster.far = desiredDistance;
        const hit = cameraRaycaster.intersectObjects(cameraObstructionMeshes, false)[0];
        if (hit) {
          return hit.distance;
        }
      }
      return null;
    }

    function resolveAndApplyCameraPose(cameraPosition: THREE.Vector3, target: THREE.Vector3, recoverImmediately = false) {
      const obstructionDistance = readCameraObstructionDistance(target, cameraPosition);
      const resolved = resolveCameraPose({
        desiredCamera: cameraPosition,
        target,
        previousRenderedDistance: renderedCameraDistance,
        obstructionDistance,
        padding: CAMERA_PADDING,
        minDistance: CAMERA_MIN_DISTANCE,
        recoverImmediately,
      });
      renderedCameraDistance = resolved.renderedDistance;
      controls.target.copy(resolved.pose.target);
      camera.position.copy(resolved.pose.camera);
      camera.lookAt(controls.target);
      recordCameraDebug("obstruction-resolve", obstructionDistance);
      return resolved.pose;
    }

    function drainControlsInputPreservingPose() {
      const preservedPose = getRenderedCameraPose();
      const dampingEnabled = controls.enableDamping;

      // Drain pending interaction deltas before scripted travel takes ownership.
      controls.enableDamping = false;
      controls.update();
      camera.position.copy(preservedPose.camera);
      controls.target.copy(preservedPose.target);
      controls.update();
      controls.enableDamping = dampingEnabled;
      camera.position.copy(preservedPose.camera);
      controls.target.copy(preservedPose.target);
      camera.lookAt(controls.target);
      desiredCameraOffset.copy(camera.position).sub(controls.target);
      renderedCameraDistance = desiredCameraOffset.length();
      recordCameraDebug("controls-handoff");
    }

    function rebaseControlsFromRenderedPose() {
      desiredCameraOffset.copy(camera.position).sub(controls.target);
      renderedCameraDistance = desiredCameraOffset.length();
      controls.enabled = true;
      recordCameraDebug("controls-handoff");
    }

    function getRenderedCameraPose(): CameraPose {
      return {
        camera: camera.position.clone(),
        target: controls.target.clone(),
      };
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    controls.addEventListener("start", cancelFocus);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", handleResize);

    runtimeRef.current = { updateOrbs };
    syncRigTerrainHeight();
    updateOrbs(tracesRef.current, selectedTraceIdRef.current, nowRef.current);
    startVisitorChannel();

    const loader = new GLTFLoader();
    loader.load(
      "/worlds/traces-world.glb",
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.receiveShadow = true;
            object.castShadow = true;
          }
        });
        environmentGroup.add(gltf.scene);
        applyRoomMetadata(gltf.scene);
        updateOrbs(tracesRef.current, selectedTraceIdRef.current, nowRef.current);
      },
      undefined,
      () => {
        if (!disposed) {
          setDefaultRoom();
          updateOrbs(tracesRef.current, selectedTraceIdRef.current, nowRef.current);
        }
      },
    );

    function animate() {
      const deltaSeconds = Math.min(clock.getDelta(), 0.1);
      const now = performance.now();
      let focusCompletedThisFrame = false;
      let focusedTrace: Trace | null = null;
      orbGroup.children.forEach((child) => {
        child.position.y = Number(child.userData.baseY) + Math.sin(now * 0.0015 + Number(child.userData.floatOffset)) * 0.16;
      });

      remoteLights.forEach((remote) => {
        remote.target.y = resolveSurfaceHeight(remote.target.x, remote.target.z) + VISITOR_LIGHT_HEIGHT;
        remote.root.position.lerp(remote.target, 0.14);
      });

      if (focusAnimation) {
        const progress = THREE.MathUtils.clamp((now - focusAnimation.startedAt) / FOCUS_DURATION_MS, 0, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        desiredCamera.lerpVectors(focusAnimation.fromCamera, focusAnimation.toCamera, easedProgress);
        controls.target.lerpVectors(focusAnimation.fromTarget, focusAnimation.toTarget, easedProgress);
        desiredCameraOffset.copy(desiredCamera).sub(controls.target);
        resolveAndApplyCameraPose(desiredCamera, controls.target, true);
        if (progress === 1) {
          focusedTrace = focusAnimation.trace;
          focusAnimation = null;
          focusCompletedThisFrame = true;
        }
      } else {
        advanceAutoTravel(deltaSeconds);
        movement.set(0, 0, 0);
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() > 0.001) {
          forward.normalize();
          right.crossVectors(forward, up).normalize();
          if (pressedKeys.has("w")) movement.add(forward);
          if (pressedKeys.has("s")) movement.sub(forward);
          if (pressedKeys.has("d")) movement.add(right);
          if (pressedKeys.has("a")) movement.sub(right);
        }
        if (movement.lengthSq() > 0) {
          movement.normalize().multiplyScalar(WALK_SPEED * deltaSeconds);
          moveRig(movement.x, movement.z);
        }

        syncRigTerrainHeight();
        camera.position.copy(controls.target).add(desiredCameraOffset);
        previousTarget.copy(controls.target);
        controls.update();
        desiredCameraOffset.copy(camera.position).sub(controls.target);
        const panX = controls.target.x - previousTarget.x;
        const panZ = controls.target.z - previousTarget.z;
        controls.target.copy(previousTarget);
        moveRig(panX, panZ);
        syncRigTerrainHeight();
        desiredCamera.copy(controls.target).add(desiredCameraOffset);
        resolveAndApplyCameraPose(desiredCamera, controls.target);
      }

      if (focusCompletedThisFrame) {
        rebaseControlsFromRenderedPose();
      }
      announceLocalMovement();
      renderer.render(scene, camera);
      recordCameraDebug("render");
      if (focusedTrace) {
        waitToRevealTrace(focusedTrace, now);
      }
      revealTraceWhenCameraSettles(now);
    }

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      runtimeRef.current = null;
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.removeEventListener("start", cancelFocus);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      if (settledPresenceTimer) {
        window.clearTimeout(settledPresenceTimer);
      }
      cancelPendingTraceReveal();
      if (cameraDebugOverlay) {
        container.removeChild(cameraDebugOverlay);
      }
      if (cameraDebugEnabled) {
        delete (window as typeof window & { __tracesCameraDebug?: CameraDebugApi }).__tracesCameraDebug;
      }
      if (visitorChannel) {
        const supabase = getSupabaseClient();
        void visitorChannel.untrack();
        if (supabase) {
          void supabase.removeChannel(visitorChannel);
        }
      }
      disposeChildren(orbGroup);
      disposeChildren(visitorGroup);
      disposeChildren(environmentGroup);
      if (fallbackGrid) {
        fallbackGrid.geometry.dispose();
        disposeMaterial(fallbackGrid.material);
      }
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="trace-world" ref={containerRef} aria-label="Immersive 3D trace field">
      <div className="world-caption">
        <span className="desktop-world-caption">WASD TO WALK. DRAG TO LOOK. TAP AN ORB.</span>
        <span className="mobile-world-caption">DRAG TO LOOK. TAP THE GROUND TO MOVE. TAP AN ORB TO LISTEN.</span>
      </div>
    </div>
  );
}

function scatterOrbs(
  traces: Trace[],
  bounds: RoomBounds,
  floorY: number,
  obstacles: RoomBounds[],
  resolveSurfaceHeight: (x: number, z: number) => number,
): OrbPlacement[] {
  const occupied: THREE.Vector2[] = [];
  return [...traces]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((trace) => {
      const random = mulberry32(hashString(trace.id));
      let point: THREE.Vector2 | null = null;

      for (let attempt = 0; attempt < 80; attempt += 1) {
        const candidate = new THREE.Vector2(
          THREE.MathUtils.lerp(bounds.minX, bounds.maxX, random()),
          THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, random()),
        );
        if (!isPointBlocked(candidate, obstacles, ORB_CLEARANCE) && occupied.every((other) => other.distanceTo(candidate) >= ORB_SPACING)) {
          point = candidate;
          break;
        }
      }

      point ??= findMaximumClearancePoint(bounds, obstacles, occupied);
      occupied.push(point);
      return {
        trace,
        position: new THREE.Vector3(point.x, Math.max(floorY, resolveSurfaceHeight(point.x, point.y)) + 1.3 + random() * 4.5, point.y),
      };
    });
}

function collectMeshes(root: THREE.Object3D, names: string[]) {
  const meshes: THREE.Mesh[] = [];
  names.forEach((name) => {
    root.getObjectByName(name)?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        meshes.push(object);
      }
    });
  });
  return meshes;
}

function collectBounds(root: THREE.Object3D, names: string[]) {
  return collectMeshes(root, names).flatMap((mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    return box.isEmpty()
      ? []
      : [
          {
            minX: box.min.x,
            maxX: box.max.x,
            minZ: box.min.z,
            maxZ: box.max.z,
          },
        ];
  });
}

function findMaximumClearancePoint(bounds: RoomBounds, obstacles: RoomBounds[], occupied: THREE.Vector2[]) {
  let bestPoint = new THREE.Vector2((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2);
  let bestScore = -Infinity;

  for (let xStep = 0; xStep <= 24; xStep += 1) {
    for (let zStep = 0; zStep <= 32; zStep += 1) {
      const point = new THREE.Vector2(
        THREE.MathUtils.lerp(bounds.minX, bounds.maxX, xStep / 24),
        THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, zStep / 32),
      );
      if (isPointBlocked(point, obstacles, ORB_CLEARANCE)) {
        continue;
      }

      const score = occupied.length ? Math.min(...occupied.map((other) => other.distanceTo(point))) : Infinity;
      if (score > bestScore) {
        bestPoint = point;
        bestScore = score;
      }
    }
  }

  return bestPoint;
}

function parseVisitorPayload(value: unknown, bounds: RoomBounds, blockers: RoomBounds[]): VisitorPayload | null {
  if (!isValidWorldPosition(value, bounds)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.sessionId !== "string" ||
    payload.sessionId.length < 1 ||
    payload.sessionId.length > 80 ||
    typeof payload.colorIndex !== "number" ||
    !Number.isInteger(payload.colorIndex) ||
    payload.colorIndex < 0 ||
    payload.colorIndex >= VISITOR_COLORS.length ||
    isPointBlocked(new THREE.Vector2(value.x, value.z), blockers)
  ) {
    return null;
  }
  return {
    sessionId: payload.sessionId,
    colorIndex: payload.colorIndex,
    x: value.x,
    z: value.z,
  };
}

function createSessionId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
  );
}

function disposeChildren(group: THREE.Object3D) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
  group.clear();
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else {
    material.dispose();
  }
}

function roundNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundVector(vector: THREE.Vector3) {
  return vector.toArray().map(roundNumber);
}
