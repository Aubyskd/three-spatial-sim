import { ALGORITHM_DEFAULTS, type ObjectiveWeights } from '../algorithm/EnvironmentConfig';
import type { ConstraintContext } from '../algorithm/constraint/Constraint';
import { ConstraintEngine } from '../algorithm/constraint/ConstraintEngine';
import type { ConstraintResult } from '../algorithm/constraint/ConstraintResult';
import type { OptimizationMetrics } from '../algorithm/metrics/Metrics';
import { ObjectiveEngine } from '../algorithm/objective/ObjectiveEngine';
import { RewardCalculator } from '../algorithm/objective/RewardCalculator';
import { sampleTerrainHeight } from '../terrain/TerrainDataUtils';
import type { PlacedAsset } from '../terrain/TerrainTypes';
import { CoverageEvaluator } from './CoverageEvaluator';

export interface PlacementCandidate { x: number; z: number; rotationY?: number; }
export interface SpatialEvaluation {
  score: number;
  metrics: OptimizationMetrics;
  assets: PlacedAsset[];
  constraints: ConstraintResult[];
}

export class SpatialEvaluator {
  private readonly constraints = new ConstraintEngine();
  private readonly coverage = new CoverageEvaluator();
  private readonly objective: ObjectiveEngine;

  constructor(private readonly context: Omit<ConstraintContext, 'assets'>, weights: ObjectiveWeights, targetAssetCount: number) {
    this.objective = new ObjectiveEngine(new RewardCalculator(weights, targetAssetCount));
  }

  validateCandidate(candidate: PlacementCandidate, accepted: readonly PlacementCandidate[] = []): { valid: boolean; constraints: ConstraintResult[] } {
    const assets = accepted.map((item, index): PlacedAsset => ({
      id: `candidate-tower-${index + 1}`,
      terrainId: this.context.terrain.terrainId,
      definitionId: 'signal-tower',
      position: { x: item.x, y: sampleTerrainHeight(this.context.terrain, item.x, item.z), z: item.z },
      rotationY: item.rotationY ?? 0,
      createdAt: 0,
    }));
    const action = { type: 'PLACE_ASSET' as const, assetType: 'signal-tower', position: { x: candidate.x, z: candidate.z }, rotationY: candidate.rotationY };
    const result = this.constraints.validate(action, { ...this.context, assets });
    return { valid: result.valid, constraints: result.results };
  }

  evaluatePlacementSet(candidates: readonly PlacementCandidate[]): SpatialEvaluation {
    const assets: PlacedAsset[] = [];
    const results: ConstraintResult[] = [];
    candidates.forEach((candidate, index) => {
      const action = { type: 'PLACE_ASSET' as const, assetType: 'signal-tower', position: { x: candidate.x, z: candidate.z }, rotationY: candidate.rotationY };
      const validation = this.constraints.validate(action, { ...this.context, assets });
      results.push(...validation.results);
      if (!validation.valid) return;
      assets.push({
        id: `candidate-tower-${index + 1}`,
        terrainId: this.context.terrain.terrainId,
        definitionId: 'signal-tower',
        position: { x: candidate.x, y: sampleTerrainHeight(this.context.terrain, candidate.x, candidate.z), z: candidate.z },
        rotationY: candidate.rotationY ?? 0,
        createdAt: 0,
      });
    });
    const coverage = this.coverage.evaluate(assets, this.context);
    const failed = results.filter((result) => !result.valid).length;
    const metrics: OptimizationMetrics = {
      coverageRatio: coverage.coverageRatio,
      overlapRatio: coverage.overlapRatio,
      towerCount: assets.length,
      totalCost: assets.length * ALGORITHM_DEFAULTS.towerCost,
      constraintViolations: failed,
    };
    return { ...this.objective.evaluate(metrics), assets, constraints: results };
  }
}
