import type { BuildingCollection, LocalBuildingFeature } from '../gis/VectorFeatureTypes';
import type { SemanticMap } from '../semantic/SemanticMap';
import { hasTerrainSupport, sampleTerrainHeight } from '../terrain/TerrainDataUtils';
import type { TerrainData } from '../terrain/TerrainTypes';
import type { Vector3Data } from '../types';
import type { PhysicalPointReason, PhysicalPointResult } from './PhysicalPointTypes';

export interface PhysicalClearanceProvider { hasBuildingClearance(position: Vector3Data, radius?: number): boolean; }
export interface SpatialPointValidationResult { valid: boolean; groundPosition?: Vector3Data; reasons: PhysicalPointReason[]; detail?: string; }

export class SpatialPointValidator {
  constructor(
    private readonly terrain: TerrainData,
    private readonly semantics: SemanticMap,
    private readonly buildings?: BuildingCollection,
    private readonly physics?: PhysicalClearanceProvider,
  ) {}

  validate(candidate: PhysicalPointResult, probeRadius = 0.25): SpatialPointValidationResult {
    if (!candidate.valid) return { valid: false, reasons: [candidate.reason ?? 'NO_TERRAIN_SUPPORT'], detail: candidate.detail };
    const point = candidate.groundPosition;
    if (!point) return { valid: false, reasons: ['NO_TERRAIN_SUPPORT'] };
    const maxX = this.terrain.origin.x + this.terrain.width; const maxZ = this.terrain.origin.z + this.terrain.depth;
    if (point.x < this.terrain.origin.x || point.x > maxX || point.z < this.terrain.origin.z || point.z > maxZ) return { valid: false, reasons: ['OUTSIDE_TERRAIN'] };
    if (!hasTerrainSupport(this.terrain, point.x, point.z)) return { valid: false, reasons: ['NO_TERRAIN_SUPPORT'] };
    const y = sampleTerrainHeight(this.terrain, point.x, point.z);
    if (!Number.isFinite(y)) return { valid: false, reasons: ['NO_TERRAIN_SUPPORT'] };
    const groundPosition = { x: point.x, y, z: point.z };
    if ((this.buildings?.features ?? []).some((building) => insideBuilding(building, point.x, point.z))) return { valid: false, groundPosition, reasons: ['BUILDING_COLLISION'] };
    if (this.physics && !this.physics.hasBuildingClearance(groundPosition, probeRadius)) return { valid: false, groundPosition, reasons: ['PHYSICS_COLLISION'] };
    const semantic = this.semantics.validateTarget(point.x, point.z);
    if (!semantic.valid) return { valid: false, groundPosition, reasons: ['SEMANTIC_FORBIDDEN'], detail: semantic.reason };
    return { valid: true, groundPosition, reasons: [] };
  }
}

function insideBuilding(building: LocalBuildingFeature, x: number, z: number): boolean {
  const outer = building.rings[0];
  return Boolean(outer && pointInRing(outer, x, z) && !building.rings.slice(1).some((hole) => pointInRing(hole, x, z)));
}

function pointInRing(ring: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, zi] = ring[index]; const [xj, zj] = ring[previous];
    if (((zi > z) !== (zj > z)) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
