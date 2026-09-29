import type { Vector3Data } from '../types';
import type { RoadGraph } from './RoadGraph';

export interface RoadSnapResult {
  valid: boolean;
  originalPosition: Vector3Data;
  snappedPosition?: Vector3Data;
  roadEdgeId?: string;
  distance?: number;
  distanceFromSource?: number;
  distanceToTarget?: number;
  reason?: 'NO_NEARBY_TRAVERSABLE_ROAD';
}

export class RoadSnapper {
  constructor(private readonly graph: RoadGraph) {}

  snap(position: Vector3Data, maxRoadSnapDistance = 10): RoadSnapResult {
    if (!Number.isFinite(maxRoadSnapDistance) || maxRoadSnapDistance < 0) throw new Error('maxRoadSnapDistance must be finite and non-negative.');
    let best: Required<Pick<RoadSnapResult, 'snappedPosition' | 'roadEdgeId' | 'distance' | 'distanceFromSource' | 'distanceToTarget'>> | undefined;
    for (const edge of this.graph.edges.values()) {
      const a = edge.geometry[0]; const b = edge.geometry[edge.geometry.length - 1];
      const dx = b.x - a.x; const dz = b.z - a.z; const denominator = dx * dx + dz * dz;
      const t = denominator <= 1e-12 ? 0 : Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / denominator));
      const snappedPosition = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      const distance = distance3D(position, snappedPosition);
      if (!best || distance < best.distance) best = { snappedPosition, roadEdgeId: edge.id, distance, distanceFromSource: edge.length * t, distanceToTarget: edge.length * (1 - t) };
    }
    if (!best || best.distance > maxRoadSnapDistance) return { valid: false, originalPosition: { ...position }, reason: 'NO_NEARBY_TRAVERSABLE_ROAD' };
    return { valid: true, originalPosition: { ...position }, ...best };
  }
}

function distance3D(a: Vector3Data, b: Vector3Data): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
