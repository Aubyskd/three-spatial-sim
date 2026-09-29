import type { Vector3Data } from '../types';

export interface ShortestPathChoice {
  path: Vector3Data[];
  cost: number;
}

export function computePathLength(path: readonly Vector3Data[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index]; const b = path[index + 1];
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

export function chooseShortestPath(paths: readonly (readonly Vector3Data[])[]): ShortestPathChoice | undefined {
  let best: ShortestPathChoice | undefined;
  for (const candidate of paths) {
    if (candidate.length < 2 || candidate.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))) continue;
    const cost = computePathLength(candidate);
    if (!best || cost < best.cost) best = { path: candidate.map((point) => ({ ...point })), cost };
  }
  return best;
}
