import type { TerrainData } from './TerrainTypes';

const inferredWaterThresholds = new WeakMap<TerrainData, { revision: number; threshold: number }>();

export function sampleTerrainHeight(data: TerrainData, x: number, z: number): number {
  const u = (x - data.origin.x) / data.width;
  const v = (z - data.origin.z) / data.depth;
  if (u < 0 || u > 1 || v < 0 || v > 1) return Number.NaN;
  const gx = u * (data.cols - 1);
  const gz = v * (data.rows - 1);
  const x0 = Math.floor(gx); const z0 = Math.floor(gz);
  const x1 = Math.min(data.cols - 1, x0 + 1); const z1 = Math.min(data.rows - 1, z0 + 1);
  const tx = gx - x0; const tz = gz - z0;
  const h00 = data.heights[z0 * data.cols + x0]; const h10 = data.heights[z0 * data.cols + x1];
  const h01 = data.heights[z1 * data.cols + x0]; const h11 = data.heights[z1 * data.cols + x1];
  // Match PlaneGeometry and Rapier's heightfield diagonal (SW to NE).
  // Bilinear interpolation can place a character metres below coarse DEM triangles.
  return tx + tz <= 1
    ? h00 * (1 - tx - tz) + h10 * tx + h01 * tz
    : h11 * (tx + tz - 1) + h01 * (1 - tx) + h10 * (1 - tz);
}

export function hasTerrainSupport(data: TerrainData, x: number, z: number): boolean {
  const u = (x - data.origin.x) / data.width;
  const v = (z - data.origin.z) / data.depth;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (!data.sampleCoverage) return true;
  const gx = u * (data.cols - 1);
  const gz = v * (data.rows - 1);
  const x0 = Math.floor(gx); const z0 = Math.floor(gz);
  const x1 = Math.min(data.cols - 1, x0 + 1); const z1 = Math.min(data.rows - 1, z0 + 1);
  return data.sampleCoverage[z0 * data.cols + x0] === 1
    && data.sampleCoverage[z0 * data.cols + x1] === 1
    && data.sampleCoverage[z1 * data.cols + x0] === 1
    && data.sampleCoverage[z1 * data.cols + x1] === 1;
}

export function getInferredWaterThreshold(data: TerrainData): number {
  if (Number.isFinite(data.source?.waterLevel)) return data.source!.waterLevel!;
  const cached = inferredWaterThresholds.get(data);
  if (cached?.revision === data.revision) return cached.threshold;
  const heights = Array.from(data.heights).filter((_, index) => !data.sampleCoverage || data.sampleCoverage[index] === 1).sort((a, b) => a - b);
  const threshold = heights[Math.floor(heights.length * 0.1)] ?? data.minHeight;
  inferredWaterThresholds.set(data, { revision: data.revision, threshold });
  return threshold;
}

export function isInferredWater(data: TerrainData, x: number, z: number): boolean {
  const enabled = data.source?.type === 'glb' ? data.source.waterMode === 'inferred'
    : data.source?.type !== 'gis-dem' && data.waterRegions.length === 0;
  return enabled && hasTerrainSupport(data, x, z) && sampleTerrainHeight(data, x, z) <= getInferredWaterThreshold(data);
}

export function isExplicitWater(data: TerrainData, x: number, z: number): boolean {
  const grid = data.waterGrid;
  if (!grid) return false;
  const u = (x - data.origin.x) / data.width;
  const v = (z - data.origin.z) / data.depth;
  if (u < 0 || u > 1 || v < 0 || v > 1 || !hasTerrainSupport(data, x, z)) return false;
  const col = Math.min(grid.cols - 1, Math.floor(u * grid.cols));
  const row = Math.min(grid.rows - 1, Math.floor(v * grid.rows));
  const index = row * grid.cols + col;
  return grid.mask[index] === 1 && sampleTerrainHeight(data, x, z) <= grid.heights[index] + 0.04;
}

export function getTerrainSlope(data: TerrainData, x: number, z: number): number {
  const dx = data.width / Math.max(1, data.cols - 1); const dz = data.depth / Math.max(1, data.rows - 1);
  const values = [sampleTerrainHeight(data, x - dx, z), sampleTerrainHeight(data, x + dx, z), sampleTerrainHeight(data, x, z - dz), sampleTerrainHeight(data, x, z + dz)];
  if (!values.every(Number.isFinite)) return 90;
  return Math.atan(Math.hypot((values[1] - values[0]) / (2 * dx), (values[3] - values[2]) / (2 * dz))) * 180 / Math.PI;
}

export function recomputeHeightRange(data: TerrainData): void {
  let min = Infinity; let max = -Infinity;
  for (const height of data.heights) { min = Math.min(min, height); max = Math.max(max, height); }
  data.minHeight = min; data.maxHeight = max;
}
