import type { PlacedAsset } from '../../terrain/TerrainTypes';
import type { Vector3Data } from '../../types';

export interface WorldState {
  terrainId: string;
  terrainRevision: number;
  stepIndex: number;
  placedAssets: PlacedAsset[];
  agentState?: { position: Vector3Data; velocity: Vector3Data };
  targetState?: { position: Vector3Data };
  runtimeStatus: 'READY' | 'SWITCHING' | 'TERMINATED' | 'TRUNCATED';
}
