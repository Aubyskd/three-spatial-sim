import type { Vector3Data } from '../types';

export type PhysicalPointSurfaceType = 'terrain' | 'building' | 'road' | 'none';
export type PhysicalPointReason =
  | 'BUILDING_SURFACE'
  | 'BUILDING_COLLISION'
  | 'NO_TERRAIN_SUPPORT'
  | 'OUTSIDE_TERRAIN'
  | 'PHYSICS_COLLISION'
  | 'SEMANTIC_FORBIDDEN'
  | 'NO_NEARBY_TRAVERSABLE_ROAD';

export interface PhysicalPointResult {
  valid: boolean;
  surfaceType: PhysicalPointSurfaceType;
  groundPosition?: Vector3Data;
  reason?: PhysicalPointReason;
  detail?: string;
}
