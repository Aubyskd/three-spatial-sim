import type { SemanticRegionData } from '../map/MapTypes';
import { isExplicitWater } from '../terrain/TerrainDataUtils';
import type { TerrainData } from '../terrain/TerrainTypes';
import { ManualOverrideLayer } from './ManualOverride';
import { SemanticRegion } from './SemanticRegion';

export class SemanticMap {
  readonly autoRegions: readonly SemanticRegion[];
  readonly manual = new ManualOverrideLayer();
  private readonly meshWaterRegionIds: ReadonlySet<string>;

  constructor(
    regions: SemanticRegionData[],
    private readonly bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    private readonly terrain?: TerrainData,
  ) {
    this.autoRegions = regions.map((region) => new SemanticRegion(region));
    this.meshWaterRegionIds = new Set(terrain?.waterRegions.map((region) => region.id) ?? []);
  }

  regionAt(x: number, z: number): SemanticRegion | undefined {
    return this.manual.at(x, z) ?? [...this.autoRegions].reverse().find((region) =>
      region.contains(x, z) && (!this.terrain?.waterGrid || !this.meshWaterRegionIds.has(region.id) || isExplicitWater(this.terrain, x, z)));
  }

  validateTarget(x: number, z: number): { valid: boolean; reason?: string } {
    if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) return { valid: false, reason: '目标超出地图边界' };
    const region = this.regionAt(x, z);
    if (region && !region.walkable) return { valid: false, reason: `目标位于不可通行区域：${region.type}` };
    return { valid: true };
  }

  movementCostAt(x: number, z: number): number {
    const region = this.regionAt(x, z);
    return region?.walkable === false ? Number.POSITIVE_INFINITY : (region?.movementCost ?? 1.2);
  }

  segmentIntersectsRestricted(start: { x: number; z: number }, end: { x: number; z: number }): boolean {
    for (const region of this.manual.all()) {
      if (region.type === 'restricted' && !region.walkable && region.intersectsSegment(start, end)) return true;
    }
    for (const region of this.autoRegions) {
      if (region.type === 'restricted' && !region.walkable && region.intersectsSegment(start, end)) return true;
    }
    return false;
  }
}
