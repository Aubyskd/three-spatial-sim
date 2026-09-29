import type { SpatialPoint } from '../spatial/SpatialPoint';

export interface VisibilityConfig {
  observerHeightOffset: number;
  targetHeightOffset: number;
  visibilityEpsilon: number;
}

export const DEFAULT_VISIBILITY_CONFIG: Readonly<VisibilityConfig> = Object.freeze({
  observerHeightOffset: 1.5,
  targetHeightOffset: 1.5,
  visibilityEpsilon: 0.01,
});

export interface VisibilityBlocker {
  objectId?: string;
  distance: number;
  point: { x: number; y: number; z: number };
}

export interface VisibilityPairResult {
  observerId: string;
  targetId: string;
  visible: boolean;
  directDistance: number;
  blocker?: VisibilityBlocker;
}

export interface VisibilityMatrixResult {
  type: 'visibility-matrix';
  terrainId: string;
  terrainRevision: number;
  observerIds: string[];
  targetIds: string[];
  observers: SpatialPoint[];
  targets: SpatialPoint[];
  matrix: number[][];
  config: VisibilityConfig;
  pairs: VisibilityPairResult[];
}
