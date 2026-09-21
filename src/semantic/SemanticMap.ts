import type { SemanticRegionData } from '../map/MapTypes';
import { isExplicitWater } from '../terrain/TerrainDataUtils';
import type { TerrainData } from '../terrain/TerrainTypes';
import { ManualOverrideLayer } from './ManualOverride';
import { SemanticRegion } from './SemanticRegion';

export class SemanticMap {
  readonly autoRegions: readonly SemanticRegion[];
  readonly manual = new ManualOverrideLayer();
  private readonly meshWaterRegionIds: ReadonlySet<string>;
  private readonly bucketColumns = 48;
  private readonly bucketRows = 48;
  private readonly autoBuckets = new Map<string, SemanticRegion[]>();

  constructor(
    regions: SemanticRegionData[],
    private readonly bounds = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    private readonly terrain?: TerrainData,
  ) {
    this.autoRegions = regions.map((region) => new SemanticRegion(region));
    this.meshWaterRegionIds = new Set(terrain?.waterRegions.map((region) => region.id) ?? []);
    for (const region of this.autoRegions) this.addToBuckets(region);
  }

  regionAt(x: number, z: number): SemanticRegion | undefined {
    return this.manual.at(x, z) ?? [...this.regionsAt(x, z)].reverse().find((region) =>
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
    for (const region of this.regionsForBounds(start, end)) {
      if (region.type === 'restricted' && !region.walkable && region.intersectsSegment(start, end)) return true;
    }
    return false;
  }

  segmentIntersectsBlocked(start: { x: number; z: number }, end: { x: number; z: number }): boolean {
    for (const region of this.manual.all()) {
      if (!region.walkable && (region.type === 'restricted' || region.type === 'obstacle') && region.intersectsSegment(start, end)) return true;
    }
    for (const region of this.regionsForBounds(start, end)) {
      if (!region.walkable && (region.type === 'restricted' || region.type === 'obstacle') && region.intersectsSegment(start, end)) return true;
    }
    return false;
  }

  private regionsAt(x: number, z: number): readonly SemanticRegion[] {
    return this.autoBuckets.get(this.bucketKey(this.columnAt(x), this.rowAt(z))) ?? [];
  }

  private regionsForBounds(a: { x: number; z: number }, b: { x: number; z: number }): SemanticRegion[] {
    const found = new Set<SemanticRegion>();
    const minCol = this.columnAt(Math.min(a.x, b.x)); const maxCol = this.columnAt(Math.max(a.x, b.x));
    const minRow = this.rowAt(Math.min(a.z, b.z)); const maxRow = this.rowAt(Math.max(a.z, b.z));
    for (let col = minCol; col <= maxCol; col += 1) for (let row = minRow; row <= maxRow; row += 1) {
      for (const region of this.autoBuckets.get(this.bucketKey(col, row)) ?? []) found.add(region);
    }
    return [...found];
  }

  private addToBuckets(region: SemanticRegion): void {
    const bounds = region.getBounds();
    const minCol = this.columnAt(bounds.minX); const maxCol = this.columnAt(bounds.maxX);
    const minRow = this.rowAt(bounds.minZ); const maxRow = this.rowAt(bounds.maxZ);
    for (let col = minCol; col <= maxCol; col += 1) for (let row = minRow; row <= maxRow; row += 1) {
      const key = this.bucketKey(col, row); const bucket = this.autoBuckets.get(key) ?? [];
      bucket.push(region); this.autoBuckets.set(key, bucket);
    }
  }

  private columnAt(x: number): number {
    const ratio = (x - this.bounds.minX) / Math.max(1e-8, this.bounds.maxX - this.bounds.minX);
    return Math.max(0, Math.min(this.bucketColumns - 1, Math.floor(ratio * this.bucketColumns)));
  }
  private rowAt(z: number): number {
    const ratio = (z - this.bounds.minZ) / Math.max(1e-8, this.bounds.maxZ - this.bounds.minZ);
    return Math.max(0, Math.min(this.bucketRows - 1, Math.floor(ratio * this.bucketRows)));
  }
  private bucketKey(column: number, row: number): string { return `${column},${row}`; }
}
