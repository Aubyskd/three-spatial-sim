import type { Vector3Data } from '../types';

export type SemanticType = 'road' | 'grass' | 'water' | 'obstacle' | 'restricted';

export interface RectangleShape {
  kind: 'rectangle';
  center: { x: number; z: number };
  width: number;
  depth: number;
}

export interface PolygonShape {
  kind: 'polygon';
  points: Array<{ x: number; z: number }>;
}

export type RegionShape = RectangleShape | PolygonShape;

export interface SemanticRegionData {
  id: string;
  type: SemanticType;
  walkable: boolean;
  movementCost: number;
  shape: RegionShape;
}

export interface MapObjectData {
  id: string;
  type: 'building' | 'prop';
  position: Vector3Data;
  rotation: Vector3Data;
  scale: Vector3Data;
  size: Vector3Data;
  modelUrl?: string;
  semanticType: SemanticType;
  walkable: boolean;
}

export interface TerrainData {
  type: 'heightmap' | 'procedural';
  source?: string;
  heightScale: number;
  width: number;
  depth: number;
}

export interface WorldMap {
  terrain: TerrainData;
  objects: MapObjectData[];
  regions: SemanticRegionData[];
  spawnPoints: Record<string, Vector3Data>;
  metadata: {
    name: string;
    version: number;
    units: 'meters';
  };
}

export interface MapManifest {
  name: string;
  version: number;
  units: 'meters';
  size: { width: number; depth: number };
  terrain: { type: 'heightmap' | 'procedural'; source?: string; heightScale?: number };
  semantic: { source: string };
}

export interface MapAdapter {
  readonly baseUrl: string;
  createWorldMap(manifest: MapManifest, regions: SemanticRegionData[]): WorldMap;
}
