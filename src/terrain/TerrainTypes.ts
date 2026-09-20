import type { SemanticRegionData } from '../map/MapTypes';
import type { Vector3Data } from '../types';

export interface TerrainDescriptor {
  id: string;
  name: string;
  type: 'glb';
  source: string;
  samplingResolution: number;
  data?: string;
  metadata?: string;
  /** auto uses explicit water meshes, or a named-water lowland fallback; none disables fallback. */
  waterMode?: 'auto' | 'infer' | 'none';
  semantic?: string;
  assets?: string;
  scale?: number;
  upAxis?: 'y' | 'z';
  spawn?: Vector3Data;
}

export interface TerrainManifestV2 {
  name: string;
  version: 2;
  units: 'meters';
  defaultTerrain: string;
  terrains: TerrainDescriptor[];
  spawn?: Vector3Data;
}

export interface DetectedTerrainMesh {
  name: string;
  role: 'land' | 'water' | 'ignore';
  vertices: number;
}

export interface TerrainData {
  terrainId: string;
  width: number;
  depth: number;
  rows: number;
  cols: number;
  origin: Vector3Data;
  heights: Float32Array;
  /** 1 when the source mesh was hit while sampling, 0 for bounds padding. */
  sampleCoverage?: Uint8Array;
  /** Water sampled from explicit GLB water meshes on a cell-centred X-Z grid. */
  waterGrid?: { rows: number; cols: number; mask: Uint8Array; heights: Float32Array };
  minHeight: number;
  maxHeight: number;
  source?: { type: 'glb' | 'heightmap' | 'generated' | 'gis-dem'; url?: string; waterMode?: 'explicit' | 'inferred' | 'none'; waterLevel?: number };
  waterRegions: SemanticRegionData[];
  semanticRegions: SemanticRegionData[];
  detectedMeshes: DetectedTerrainMesh[];
  revision: number;
}

export interface PlacedAsset {
  id: string;
  terrainId: string;
  definitionId: string;
  position: Vector3Data;
  rotationY: number;
  createdAt: number;
  invalidPlacement?: boolean;
}

export interface TerrainRuntimeState {
  terrainId: string;
  terrainData: TerrainData;
  semanticOverrides: SemanticRegionData[];
  placedAssets: PlacedAsset[];
  terrainDirty: boolean;
  semanticDirty: boolean;
  assetsDirty: boolean;
  meshRoles: Record<string, DetectedTerrainMesh['role']>;
}

export type InteractionMode = 'NORMAL' | 'TERRAIN_EDIT' | 'ASSET_PLACEMENT' | 'REGION_EDIT' | 'AGENT_DEPLOYMENT' | 'TERRAIN_SWITCHING';
export type TerrainEditTool = 'raise' | 'lower' | 'flatten';
export type TerrainSwitchStage = 'Loading GLB...' | 'Sampling terrain...' | 'Building physics...' | 'Building navigation...' | 'Restoring assets...' | 'Ready';
export type TerrainErrorCode = 'UNKNOWN_TERRAIN_ID' | 'GLB_LOAD_FAILED' | 'TERRAIN_PARSE_FAILED' | 'NO_LAND_MESH' | 'INVALID_BOUNDS' | 'SAMPLING_FAILED' | 'PHYSICS_BUILD_FAILED' | 'NAVMESH_BUILD_FAILED' | 'STATE_RESTORE_FAILED';

export class TerrainError extends Error {
  constructor(readonly code: TerrainErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TerrainError';
  }
}

export function cloneTerrainData(data: TerrainData): TerrainData {
  return { ...data, origin: { ...data.origin }, heights: new Float32Array(data.heights), sampleCoverage: data.sampleCoverage ? new Uint8Array(data.sampleCoverage) : undefined, waterGrid: data.waterGrid ? { rows: data.waterGrid.rows, cols: data.waterGrid.cols, mask: new Uint8Array(data.waterGrid.mask), heights: new Float32Array(data.waterGrid.heights) } : undefined, source: data.source ? { ...data.source } : undefined, waterRegions: structuredClone(data.waterRegions), semanticRegions: structuredClone(data.semanticRegions), detectedMeshes: structuredClone(data.detectedMeshes) };
}
