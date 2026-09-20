import type { OptimizationMetrics } from '../metrics/Metrics';
import type { Vector3Data } from '../../types';

export interface GridObservation {
  rows: number;
  cols: number;
  height: number[][];
  semantic: number[][];
  occupied: number[][];
}

export interface Observation {
  terrain: {
    id: string;
    width: number;
    depth: number;
    minHeight: number;
    maxHeight: number;
    revision: number;
  };
  placedAssets: Array<{
    id: string;
    type: string;
    position: Vector3Data;
    valid: boolean;
  }>;
  agent?: { position: Vector3Data; velocity: Vector3Data };
  metrics: OptimizationMetrics;
  stepIndex: number;
}
