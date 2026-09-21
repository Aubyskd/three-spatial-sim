import type { TerrainData } from '../terrain/TerrainTypes';

export class TerrainHeightProvider {
  constructor(private readonly terrain: TerrainData) {}

  heightAt(x: number, z: number): number {
    const { origin, width, depth, rows, cols, heights } = this.terrain;
    if (x < origin.x || x > origin.x + width || z < origin.z || z > origin.z + depth) return Number.NaN;
    const col = ((x - origin.x) / width) * (cols - 1);
    const row = ((z - origin.z) / depth) * (rows - 1);
    const c0 = Math.floor(col); const r0 = Math.floor(row);
    const c1 = Math.min(cols - 1, c0 + 1); const r1 = Math.min(rows - 1, r0 + 1);
    const tx = col - c0; const tz = row - r0;
    const a = heights[r0 * cols + c0] * (1 - tx) + heights[r0 * cols + c1] * tx;
    const b = heights[r1 * cols + c0] * (1 - tx) + heights[r1 * cols + c1] * tx;
    return a * (1 - tz) + b * tz;
  }
}
