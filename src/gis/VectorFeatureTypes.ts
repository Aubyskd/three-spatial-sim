import type { SemanticRegionData } from '../map/MapTypes';

export type LocalRing = Array<[number, number]>;

export interface LocalBuildingFeature {
  id: string;
  type: 'building';
  rings: LocalRing[];
  properties: Record<string, unknown>;
  baseHeight: number;
  extrudeHeight: number;
  terrainHeights?: number[][];
  sourceFeatureId: string;
  sourceType: 'Polygon' | 'MultiPolygon';
  sourceProperties: Record<string, unknown>;
}

export interface BuildingCollection {
  type: 'BuildingCollection';
  terrainId: string;
  projectedCRS: string;
  coordinateConvention: { x: 'east'; y: 'up'; z: 'south' };
  features: LocalBuildingFeature[];
  warnings?: string[];
}

export interface LocalRoadFeature {
  id: string;
  type: 'road';
  centerline: Array<[number, number, number]>;
  properties: Record<string, unknown> & { highway?: unknown };
  width: number;
  sourceFeatureId: string;
  sourceType: 'LineString' | 'MultiLineString';
  sourceProperties: Record<string, unknown>;
}

export interface RoadCollection {
  type: 'RoadCollection';
  terrainId: string;
  projectedCRS: string;
  coordinateConvention: { x: 'east'; y: 'up'; z: 'south' };
  features: LocalRoadFeature[];
  warnings?: string[];
}

export interface BuildingColliderBox {
  id: string;
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

export function assertBuildingCollection(value: unknown, terrainId: string): BuildingCollection {
  const collection = value as Partial<BuildingCollection>;
  if (collection.type !== 'BuildingCollection' || collection.terrainId !== terrainId || !Array.isArray(collection.features)) {
    throw new Error(`Invalid BuildingCollection for terrain ${terrainId}.`);
  }
  for (const feature of collection.features) {
    if (feature.type !== 'building' || !Array.isArray(feature.rings) || !feature.rings.length ||
      !feature.rings.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPair)) ||
      !Number.isFinite(feature.baseHeight) || !Number.isFinite(feature.extrudeHeight) || feature.extrudeHeight <= 0) {
      throw new Error(`Invalid building feature ${String(feature.id)}.`);
    }
  }
  return collection as BuildingCollection;
}

export function assertRoadCollection(value: unknown, terrainId: string): RoadCollection {
  const collection = value as Partial<RoadCollection>;
  if (collection.type !== 'RoadCollection' || collection.terrainId !== terrainId || !Array.isArray(collection.features)) {
    throw new Error(`Invalid RoadCollection for terrain ${terrainId}.`);
  }
  for (const feature of collection.features) {
    if (feature.type !== 'road' || !Array.isArray(feature.centerline) || feature.centerline.length < 2 ||
      !feature.centerline.every(isTriple) || !Number.isFinite(feature.width) || feature.width <= 0) {
      throw new Error(`Invalid road feature ${String(feature.id)}.`);
    }
  }
  return collection as RoadCollection;
}

export function buildingSemanticRegions(collection?: BuildingCollection): SemanticRegionData[] {
  return collection?.features.map((feature) => ({
    id: `osm-building-${feature.id}`,
    type: 'obstacle', walkable: false, movementCost: 1000,
    shape: { kind: 'polygon', points: feature.rings[0].map(([x, z]) => ({ x, z })) },
  })) ?? [];
}

export function roadSemanticRegions(collection?: RoadCollection): SemanticRegionData[] {
  const regions: SemanticRegionData[] = [];
  for (const road of collection?.features ?? []) {
    const walkable = roadIsWalkable(road);
    if (!walkable) continue;
    for (let index = 1; index < road.centerline.length; index += 1) {
      const a = road.centerline[index - 1]; const b = road.centerline[index];
      const dx = b[0] - a[0]; const dz = b[2] - a[2]; const length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;
      const nx = (-dz / length) * road.width / 2; const nz = (dx / length) * road.width / 2;
      regions.push({
        id: `osm-road-${road.id}-${index}`,
        type: 'road', walkable: true, movementCost: 1,
        shape: { kind: 'polygon', points: [
          { x: a[0] + nx, z: a[2] + nz }, { x: b[0] + nx, z: b[2] + nz },
          { x: b[0] - nx, z: b[2] - nz }, { x: a[0] - nx, z: a[2] - nz },
        ] },
      });
    }
  }
  return regions;
}

export function roadIsWalkable(road: LocalRoadFeature): boolean {
  const highway = String(road.properties.highway ?? '');
  return !['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(highway);
}

function isPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite);
}
