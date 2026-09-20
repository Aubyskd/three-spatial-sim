import type { EnvironmentAction } from '../algorithm/action/Action';
import { createSignalTowerActionSpace, type AvailableAction } from '../algorithm/action/ActionSpace';
import type { OptimizationMetrics } from '../algorithm/metrics/Metrics';
import type { TaskDefinition } from './Task';

export class SignalTowerOptimizationTask implements TaskDefinition {
  readonly type = 'SIGNAL_TOWER_OPTIMIZATION';
  constructor(readonly targetTowerCount: number) {}
  getAvailableActions(): AvailableAction[] { return createSignalTowerActionSpace(); }
  isTerminated(metrics: OptimizationMetrics, lastAction?: EnvironmentAction): boolean {
    return metrics.towerCount >= this.targetTowerCount || (lastAction?.type === 'NO_OP' && lastAction.endEpisode === true);
  }
}
