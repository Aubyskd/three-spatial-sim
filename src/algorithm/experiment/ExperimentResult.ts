import type { PlacedAsset } from '../../terrain/TerrainTypes';
import type { OptimizationMetrics } from '../metrics/Metrics';
import type { ExperimentStepRecord } from '../metrics/MetricsCollector';
import type { ExperimentConfig } from './ExperimentConfig';

export interface AlgorithmResult {
  algorithm: string;
  terrainId: string;
  seed: number;
  bestScore: number;
  metrics: OptimizationMetrics;
  solution: { assets: PlacedAsset[] };
  history: ExperimentStepRecord[];
}

export interface ExperimentResult {
  experimentId: string;
  terrainId: string;
  terrainRevision: number;
  seed: number;
  algorithm: string;
  algorithmVersion: string;
  task: ExperimentConfig['task'];
  config: ExperimentConfig;
  timestamp: string;
  bestScore: number;
  metrics: OptimizationMetrics;
  solution: AlgorithmResult['solution'];
  history: ExperimentStepRecord[];
}

export interface OptimizationAlgorithm {
  name: string;
  version: string;
  run(environment: import('../Environment').Environment, config: ExperimentConfig, signal?: AbortSignal): Promise<AlgorithmResult>;
}
