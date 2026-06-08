import * as THREE from "three";

export type RoomBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type NavigationGrid = {
  bounds: RoomBounds;
  cellSize: number;
  columns: number;
  rows: number;
  blocked: Set<string>;
};

export const VISITOR_RADIUS = 0.9;
export const NAVIGATION_CELL_SIZE = 2;

export function insetBounds(bounds: RoomBounds, inset: number): RoomBounds {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  return {
    minX: Math.min(centerX, bounds.minX + inset),
    maxX: Math.max(centerX, bounds.maxX - inset),
    minZ: Math.min(centerZ, bounds.minZ + inset),
    maxZ: Math.max(centerZ, bounds.maxZ - inset),
  };
}

export function clampPoint(point: THREE.Vector2, bounds: RoomBounds) {
  return new THREE.Vector2(
    THREE.MathUtils.clamp(point.x, bounds.minX, bounds.maxX),
    THREE.MathUtils.clamp(point.y, bounds.minZ, bounds.maxZ),
  );
}

export function isPointInsideBounds(point: THREE.Vector2, bounds: RoomBounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minZ && point.y <= bounds.maxZ;
}

export function isPointBlocked(point: THREE.Vector2, blockers: RoomBounds[], margin = VISITOR_RADIUS) {
  return blockers.some(
    (blocker) =>
      point.x >= blocker.minX - margin &&
      point.x <= blocker.maxX + margin &&
      point.y >= blocker.minZ - margin &&
      point.y <= blocker.maxZ + margin,
  );
}

export function movePointWithCollisions(
  start: THREE.Vector2,
  delta: THREE.Vector2,
  bounds: RoomBounds,
  blockers: RoomBounds[],
) {
  const next = start.clone();
  const candidateX = clampPoint(new THREE.Vector2(next.x + delta.x, next.y), bounds);
  if (!isPointBlocked(candidateX, blockers)) {
    next.x = candidateX.x;
  }

  const candidateZ = clampPoint(new THREE.Vector2(next.x, next.y + delta.y), bounds);
  if (!isPointBlocked(candidateZ, blockers)) {
    next.y = candidateZ.y;
  }
  return next;
}

export function buildNavigationGrid(bounds: RoomBounds, blockers: RoomBounds[], cellSize = NAVIGATION_CELL_SIZE): NavigationGrid {
  const columns = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / cellSize) + 1);
  const rows = Math.max(1, Math.floor((bounds.maxZ - bounds.minZ) / cellSize) + 1);
  const grid: NavigationGrid = {
    bounds,
    cellSize,
    columns,
    rows,
    blocked: new Set(),
  };

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (isPointBlocked(cellToWorld(grid, column, row), blockers)) {
        grid.blocked.add(cellKey(column, row));
      }
    }
  }
  return grid;
}

export function findNavigationPath(grid: NavigationGrid, start: THREE.Vector2, destination: THREE.Vector2) {
  const startCell = findNearestWalkableCell(grid, worldToCell(grid, clampPoint(start, grid.bounds)));
  const destinationCell = findNearestWalkableCell(grid, worldToCell(grid, clampPoint(destination, grid.bounds)));
  if (!startCell || !destinationCell) {
    return [];
  }

  const open = new Set([cellKey(startCell.column, startCell.row)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map([[cellKey(startCell.column, startCell.row), 0]]);
  const fScore = new Map([[cellKey(startCell.column, startCell.row), cellDistance(startCell, destinationCell)]]);

  while (open.size) {
    const currentKey = [...open].reduce((best, key) => (readScore(fScore, key) < readScore(fScore, best) ? key : best));
    const current = parseCellKey(currentKey);
    if (current.column === destinationCell.column && current.row === destinationCell.row) {
      return smoothPath(grid, reconstructPath(grid, cameFrom, currentKey, destination));
    }

    open.delete(currentKey);
    for (const neighbor of getWalkableNeighbors(grid, current.column, current.row)) {
      const neighborKey = cellKey(neighbor.column, neighbor.row);
      const tentativeScore = readScore(gScore, currentKey) + cellDistance(current, neighbor);
      if (tentativeScore >= readScore(gScore, neighborKey)) {
        continue;
      }
      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentativeScore);
      fScore.set(neighborKey, tentativeScore + cellDistance(neighbor, destinationCell));
      open.add(neighborKey);
    }
  }
  return [];
}

export function isSegmentWalkable(grid: NavigationGrid, start: THREE.Vector2, end: THREE.Vector2) {
  const distance = start.distanceTo(end);
  const steps = Math.max(1, Math.ceil(distance / (grid.cellSize * 0.45)));
  for (let step = 0; step <= steps; step += 1) {
    const point = start.clone().lerp(end, step / steps);
    const cell = worldToCell(grid, point);
    if (!isWalkableCell(grid, cell.column, cell.row)) {
      return false;
    }
  }
  return true;
}

export function isValidWorldPosition(value: unknown, bounds: RoomBounds): value is { x: number; z: number } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const position = value as Record<string, unknown>;
  if (typeof position.x !== "number" || typeof position.z !== "number" || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    return false;
  }
  return isPointInsideBounds(new THREE.Vector2(position.x, position.z), bounds);
}

function smoothPath(grid: NavigationGrid, path: THREE.Vector2[]) {
  if (path.length < 3) {
    return path;
  }

  const smoothed = [path[0]];
  let anchorIndex = 0;
  while (anchorIndex < path.length - 1) {
    let nextIndex = path.length - 1;
    while (nextIndex > anchorIndex + 1 && !isSegmentWalkable(grid, path[anchorIndex], path[nextIndex])) {
      nextIndex -= 1;
    }
    smoothed.push(path[nextIndex]);
    anchorIndex = nextIndex;
  }
  return smoothed;
}

function reconstructPath(grid: NavigationGrid, cameFrom: Map<string, string>, currentKey: string, destination: THREE.Vector2) {
  const path = [clampPoint(destination, grid.bounds)];
  while (cameFrom.has(currentKey)) {
    const current = parseCellKey(currentKey);
    path.unshift(cellToWorld(grid, current.column, current.row));
    currentKey = cameFrom.get(currentKey)!;
  }
  return path;
}

function findNearestWalkableCell(grid: NavigationGrid, origin: { column: number; row: number }) {
  if (isWalkableCell(grid, origin.column, origin.row)) {
    return origin;
  }
  for (let radius = 1; radius <= 5; radius += 1) {
    for (let column = origin.column - radius; column <= origin.column + radius; column += 1) {
      for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
        if (isWalkableCell(grid, column, row)) {
          return { column, row };
        }
      }
    }
  }
  return null;
}

function getWalkableNeighbors(grid: NavigationGrid, column: number, row: number) {
  const neighbors: Array<{ column: number; row: number }> = [];
  for (let deltaColumn = -1; deltaColumn <= 1; deltaColumn += 1) {
    for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
      if (!deltaColumn && !deltaRow) {
        continue;
      }
      const nextColumn = column + deltaColumn;
      const nextRow = row + deltaRow;
      if (!isWalkableCell(grid, nextColumn, nextRow)) {
        continue;
      }
      if (
        deltaColumn &&
        deltaRow &&
        (!isWalkableCell(grid, column + deltaColumn, row) || !isWalkableCell(grid, column, row + deltaRow))
      ) {
        continue;
      }
      neighbors.push({ column: nextColumn, row: nextRow });
    }
  }
  return neighbors;
}

function isWalkableCell(grid: NavigationGrid, column: number, row: number) {
  return (
    column >= 0 &&
    column < grid.columns &&
    row >= 0 &&
    row < grid.rows &&
    !grid.blocked.has(cellKey(column, row))
  );
}

function worldToCell(grid: NavigationGrid, point: THREE.Vector2) {
  return {
    column: THREE.MathUtils.clamp(Math.round((point.x - grid.bounds.minX) / grid.cellSize), 0, grid.columns - 1),
    row: THREE.MathUtils.clamp(Math.round((point.y - grid.bounds.minZ) / grid.cellSize), 0, grid.rows - 1),
  };
}

function cellToWorld(grid: NavigationGrid, column: number, row: number) {
  return new THREE.Vector2(grid.bounds.minX + column * grid.cellSize, grid.bounds.minZ + row * grid.cellSize);
}

function cellKey(column: number, row: number) {
  return `${column}:${row}`;
}

function parseCellKey(key: string) {
  const [column, row] = key.split(":").map(Number);
  return { column, row };
}

function cellDistance(left: { column: number; row: number }, right: { column: number; row: number }) {
  return Math.hypot(right.column - left.column, right.row - left.row);
}

function readScore(scores: Map<string, number>, key: string) {
  return scores.get(key) ?? Infinity;
}
