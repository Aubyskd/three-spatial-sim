import type { OptimizationMetrics } from '../metrics/Metrics';
import type { ObjectiveEvaluation } from './Objective';
import { RewardCalculator } from './RewardCalculator';

export class ObjectiveEngine {
  constructor(private readonly rewardCalculator: RewardCalculator) {}
  evaluate(metrics: OptimizationMetrics): ObjectiveEvaluation { return { score: this.rewardCalculator.calculate(metrics), metrics: { ...metrics } }; }
}
