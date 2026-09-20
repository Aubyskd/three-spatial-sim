import type { AvailableAction } from '../algorithm/action/ActionSpace';
import type { EnvironmentAction } from '../algorithm/action/Action';
import type { OptimizationMetrics } from '../algorithm/metrics/Metrics';

export interface TaskDefinition {
  readonly type: string;
  getAvailableActions(): AvailableAction[];
  isTerminated(metrics: OptimizationMetrics, lastAction?: EnvironmentAction): boolean;
}
