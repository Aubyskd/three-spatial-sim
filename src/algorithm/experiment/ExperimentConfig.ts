import type { ObjectiveWeights } from '../EnvironmentConfig';

export interface ExperimentConfig {
  experimentId: string;
  terrainId: string;
  seed: number;
  algorithm: string;
  algorithmVersion?: string;
  task: {
    type: 'SIGNAL_TOWER_OPTIMIZATION';
    targetTowerCount: number;
  };
  maxSteps: number;
  iterations: number;
  rendering: 'visualization' | 'fast';
  objectiveWeights: ObjectiveWeights;
}
