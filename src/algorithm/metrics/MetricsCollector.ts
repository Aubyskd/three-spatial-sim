import type { EnvironmentAction } from '../action/Action';
export interface ExperimentStepRecord {
  stepIndex: number;
  action: EnvironmentAction | { type: 'CANDIDATE_LAYOUT'; iteration: number };
  actionValid: boolean;
  reward: number;
  coverage: number;
  overlap: number;
  cost: number;
  violations: number;
}

export class MetricsCollector {
  private records: ExperimentStepRecord[] = [];
  reset(): void { this.records = []; }
  record(record: ExperimentStepRecord): void { this.records.push(structuredClone(record)); }
  getHistory(): ExperimentStepRecord[] { return structuredClone(this.records); }
}
