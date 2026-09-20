import { ALGORITHM_DEFAULTS } from '../algorithm/EnvironmentConfig';
import type { OptimizationMetrics } from '../algorithm/metrics/Metrics';
import { hasTerrainSupport, isExplicitWater, isInferredWater } from '../terrain/TerrainDataUtils';
import type { PlacedAsset, TerrainData } from '../terrain/TerrainTypes';

export interface CoverageContext {
  terrain: TerrainData;
  semanticAt(x: number, z: number): { type: string; walkable: boolean } | undefined;
}

export interface CoverageResult extends Pick<OptimizationMetrics, 'coverageRatio' | 'overlapRatio'> {
  totalValidSamples: number;
  coveredSamples: number;
  overlapSamples: number;
}

export class CoverageEvaluator {
  evaluate(towers: readonly PlacedAsset[], context: CoverageContext, resolution = ALGORITHM_DEFAULTS.coverageGridResolution): CoverageResult {
    let totalValidSamples = 0; let coveredSamples = 0; let overlapSamples = 0;
    const { terrain } = context;
    for (let row = 0; row < resolution; row += 1) {
      const z = terrain.origin.z + ((row + 0.5) / resolution) * terrain.depth;
      for (let col = 0; col < resolution; col += 1) {
        const x = terrain.origin.x + ((col + 0.5) / resolution) * terrain.width;
        if (!hasTerrainSupport(terrain, x, z) || isExplicitWater(terrain, x, z) || isInferredWater(terrain, x, z)) continue;
        const semantic = context.semanticAt(x, z);
        if (semantic && (!semantic.walkable || semantic.type === 'water' || semantic.type === 'restricted')) continue;
        totalValidSamples += 1;
        let count = 0;
        for (const tower of towers) if (Math.hypot(tower.position.x - x, tower.position.z - z) <= ALGORITHM_DEFAULTS.coverageRadius) count += 1;
        if (count > 0) coveredSamples += 1;
        if (count > 1) overlapSamples += 1;
      }
    }
    return {
      coverageRatio: totalValidSamples ? coveredSamples / totalValidSamples : 0,
      overlapRatio: totalValidSamples ? overlapSamples / totalValidSamples : 0,
      totalValidSamples,
      coveredSamples,
      overlapSamples,
    };
  }
}
