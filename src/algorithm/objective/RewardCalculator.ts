import type { ObjectiveWeights } from '../EnvironmentConfig';
import type { OptimizationMetrics } from '../metrics/Metrics';

export class RewardCalculator {
  constructor(private readonly weights: ObjectiveWeights, private readonly targetAssetCount: number) {}
  calculate(metrics: OptimizationMetrics): number {
    const normalizedCost = metrics.totalCost / Math.max(1, this.targetAssetCount);
    return this.weights.coverage * metrics.coverageRatio
      - this.weights.overlap * metrics.overlapRatio
      - this.weights.cost * normalizedCost
      - this.weights.violations * metrics.constraintViolations;
  }
}
