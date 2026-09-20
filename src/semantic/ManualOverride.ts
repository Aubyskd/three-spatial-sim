import type { SemanticRegionData } from '../map/MapTypes';
import { SemanticRegion } from './SemanticRegion';

export class ManualOverrideLayer {
  private readonly regions: SemanticRegion[] = [];
  private serial = 0;

  addRestrictedRectangle(start: { x: number; z: number }, end: { x: number; z: number }): SemanticRegion {
    const width = Math.max(0.5, Math.abs(end.x - start.x));
    const depth = Math.max(0.5, Math.abs(end.z - start.z));
    const data: SemanticRegionData = {
      id: `manual-restricted-${++this.serial}`,
      type: 'restricted',
      walkable: false,
      movementCost: 1000,
      shape: {
        kind: 'rectangle',
        center: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 },
        width,
        depth,
      },
    };
    const region = new SemanticRegion(data);
    this.regions.push(region);
    return region;
  }

  addRestrictedPolygon(points: Array<{ x: number; z: number }>): SemanticRegion {
    const data: SemanticRegionData = {
      id: `manual-restricted-${++this.serial}`,
      type: 'restricted',
      walkable: false,
      movementCost: 1000,
      shape: { kind: 'polygon', points: points.map((point) => ({ ...point })) },
    };
    const region = new SemanticRegion(data);
    this.regions.push(region);
    return region;
  }

  clear(): void {
    this.regions.length = 0;
  }

  replace(regions: SemanticRegionData[]): void {
    this.regions.length = 0;
    this.regions.push(...regions.map((region) => new SemanticRegion(region)));
    this.serial = Math.max(this.serial, ...regions.map((region) => Number(/^manual-restricted-(\d+)$/.exec(region.id)?.[1] ?? 0)));
  }

  all(): readonly SemanticRegion[] {
    return this.regions;
  }

  at(x: number, z: number): SemanticRegion | undefined {
    return [...this.regions].reverse().find((region) => region.contains(x, z));
  }
}
