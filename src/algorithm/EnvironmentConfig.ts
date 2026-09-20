export type TaskType = 'SIGNAL_TOWER_OPTIMIZATION';

export interface ObjectiveWeights {
  coverage: number;
  overlap: number;
  cost: number;
  violations: number;
}

export interface EnvironmentConfig {
  terrainId: string;
  seed?: number;
  task: {
    type: TaskType;
    targetTowerCount?: number;
  };
  episode?: {
    maxSteps?: number;
    maxAssets?: number;
  };
  rendering?: {
    enabled: boolean;
  };
  assets?: {
    resetPlacedAssets?: boolean;
  };
  objectiveWeights?: Partial<ObjectiveWeights>;
}

export const ALGORITHM_DEFAULTS = {
  seed: 42,
  targetTowerCount: 5,
  maxSteps: 20,
  maxAssets: 5,
  coverageRadius: 15,
  coverageGridResolution: 64,
  minTowerDistance: 5,
  maxSlopeDegrees: 12,
  towerCost: 1,
  signalTowerFootprintRadius: 1.2,
  objectiveWeights: {
    coverage: 1,
    overlap: 0.2,
    cost: 0.1,
    violations: 1,
  } satisfies ObjectiveWeights,
} as const;

export interface ResolvedEnvironmentConfig extends EnvironmentConfig {
  seed: number;
  task: { type: TaskType; targetTowerCount: number };
  episode: { maxSteps: number; maxAssets: number };
  rendering: { enabled: boolean };
  assets: { resetPlacedAssets: boolean };
  objectiveWeights: ObjectiveWeights;
}

export function resolveEnvironmentConfig(config: EnvironmentConfig): ResolvedEnvironmentConfig {
  return {
    ...config,
    seed: config.seed ?? ALGORITHM_DEFAULTS.seed,
    task: { type: config.task.type, targetTowerCount: config.task.targetTowerCount ?? ALGORITHM_DEFAULTS.targetTowerCount },
    episode: { maxSteps: config.episode?.maxSteps ?? ALGORITHM_DEFAULTS.maxSteps, maxAssets: config.episode?.maxAssets ?? config.task.targetTowerCount ?? ALGORITHM_DEFAULTS.maxAssets },
    rendering: { enabled: config.rendering?.enabled ?? true },
    assets: { resetPlacedAssets: config.assets?.resetPlacedAssets ?? true },
    objectiveWeights: { ...ALGORITHM_DEFAULTS.objectiveWeights, ...config.objectiveWeights },
  };
}
