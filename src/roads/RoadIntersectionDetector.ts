import type { LocalRoadFeature } from '../gis/VectorFeatureTypes';
import type { Vector3Data } from '../types';
import { roadBoolean, roadLayer } from './RoadTraversalProfile';

export interface RoadSegment {
  road: LocalRoadFeature;
  segmentIndex: number;
  a: Vector3Data;
  b: Vector3Data;
}

export interface RoadIntersection {
  position: Vector3Data;
  tA: number;
  tB: number;
}

export function roadsAreTopologicallyCompatible(a: LocalRoadFeature, b: LocalRoadFeature): boolean {
  return roadLayer(a) === roadLayer(b)
    && roadBoolean(a, 'bridge') === roadBoolean(b, 'bridge')
    && roadBoolean(a, 'tunnel') === roadBoolean(b, 'tunnel');
}

export function detectRoadIntersection(a: RoadSegment, b: RoadSegment, epsilon = 1e-8): RoadIntersection | undefined {
  if (!roadsAreTopologicallyCompatible(a.road, b.road)) return undefined;
  const rx = a.b.x - a.a.x; const rz = a.b.z - a.a.z;
  const sx = b.b.x - b.a.x; const sz = b.b.z - b.a.z;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) <= epsilon) return undefined;
  const qx = b.a.x - a.a.x; const qz = b.a.z - a.a.z;
  const tA = (qx * sz - qz * sx) / denominator;
  const tB = (qx * rz - qz * rx) / denominator;
  if (tA < -epsilon || tA > 1 + epsilon || tB < -epsilon || tB > 1 + epsilon) return undefined;
  const clampedA = Math.max(0, Math.min(1, tA)); const clampedB = Math.max(0, Math.min(1, tB));
  const yA = a.a.y + (a.b.y - a.a.y) * clampedA;
  const yB = b.a.y + (b.b.y - b.a.y) * clampedB;
  return {
    position: { x: a.a.x + rx * clampedA, y: (yA + yB) / 2, z: a.a.z + rz * clampedA },
    tA: clampedA,
    tB: clampedB,
  };
}
