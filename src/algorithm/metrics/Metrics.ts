export interface OptimizationMetrics {
  coverageRatio: number;
  overlapRatio: number;
  towerCount: number;
  totalCost: number;
  constraintViolations: number;
}

export const EMPTY_METRICS: OptimizationMetrics = {
  coverageRatio: 0,
  overlapRatio: 0,
  towerCount: 0,
  totalCost: 0,
  constraintViolations: 0,
};
