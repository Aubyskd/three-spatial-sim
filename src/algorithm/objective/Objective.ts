import type { OptimizationMetrics } from '../metrics/Metrics';

export interface ObjectiveEvaluation {
  score: number;
  metrics: OptimizationMetrics;
}
