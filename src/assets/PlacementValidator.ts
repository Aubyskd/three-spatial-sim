import type { SemanticMap } from '../semantic/SemanticMap';
import { getTerrainSlope, hasTerrainSupport, isExplicitWater, isInferredWater, sampleTerrainHeight } from '../terrain/TerrainDataUtils';
import type { PlacedAsset, TerrainData } from '../terrain/TerrainTypes';
import type { AssetDefinition } from './AssetRegistry';

export interface PlacementValidation { valid: boolean; reason?: string; height?: number; slope?: number; }

export class PlacementValidator {
  constructor(private readonly terrain: TerrainData, private readonly semantics: SemanticMap, private readonly assets: PlacedAsset[]) {}
  validate(definition: AssetDefinition, x: number, z: number, ignoredAssetId?: string): PlacementValidation {
    const height = sampleTerrainHeight(this.terrain, x, z);
    if (!Number.isFinite(height)) return { valid: false, reason: 'outsideTerrainBounds' };
    if (!hasTerrainSupport(this.terrain, x, z)) return { valid: false, reason: 'noTerrainSupport' };
    const region = this.semantics.regionAt(x, z);
    if (region && !region.walkable) return { valid: false, reason: region.type };
    if (isExplicitWater(this.terrain, x, z) || isInferredWater(this.terrain, x, z)) return { valid: false, reason: 'water' };
    const slope = getTerrainSlope(this.terrain, x, z);
    if (slope > definition.maxSlopeDegrees) return { valid: false, reason: `slope ${slope.toFixed(1)}°`, height, slope };
    if (this.assets.some((asset) => asset.id !== ignoredAssetId && Math.hypot(asset.position.x - x, asset.position.z - z) < definition.footprintRadius * 2.2)) return { valid: false, reason: 'collision', height, slope };
    return { valid: true, height, slope };
  }
}
