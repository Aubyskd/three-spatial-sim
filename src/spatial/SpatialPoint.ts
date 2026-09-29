import type { Vector3Data } from '../types';

export type SpatialPointType = 'observer' | 'target' | 'graph-node';
export type SpatialSelectionMode = 'none' | SpatialPointType;

export interface SpatialPoint {
  id: string;
  type: SpatialPointType;
  /** Physically validated terrain-surface position in Local World Coordinates, metres. */
  groundPosition: Vector3Data;
  /** Effective position used by the current analysis (e.g. ground + observer height). */
  analysisPosition?: Vector3Data;
  heightOffset?: number;
  valid: boolean;
  validation?: { reasons: string[] };
  metadata?: Record<string, unknown>;
}

export function cloneSpatialPoint(point: SpatialPoint): SpatialPoint {
  return { ...point, groundPosition: { ...point.groundPosition }, analysisPosition: point.analysisPosition ? { ...point.analysisPosition } : undefined, validation: point.validation ? { reasons: [...point.validation.reasons] } : undefined, metadata: point.metadata ? structuredClone(point.metadata) : undefined };
}
