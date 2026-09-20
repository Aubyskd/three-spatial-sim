import type { PlacementCandidate, SpatialEvaluation } from '../../evaluation/SpatialEvaluator';
import { EnvironmentError } from '../EnvironmentError';
import type { Environment } from '../Environment';
import type { ExperimentConfig } from '../experiment/ExperimentConfig';
import type { AlgorithmResult, OptimizationAlgorithm } from '../experiment/ExperimentResult';
import { SeedManager } from '../experiment/SeedManager';
import type { ExperimentStepRecord } from '../metrics/MetricsCollector';

export class RandomSearchBaseline implements OptimizationAlgorithm {
  readonly name = 'Random Search';
  readonly version = '1.0.0';

  async run(environment: Environment, config: ExperimentConfig, signal?: AbortSignal): Promise<AlgorithmResult> {
    const terrain = environment.getTerrainData();
    if (!terrain) throw new EnvironmentError('TERRAIN_NOT_READY', 'Random Search requires an active terrain.');
    const random = new SeedManager(config.seed);
    const history: ExperimentStepRecord[] = [];
    let best: SpatialEvaluation | undefined;
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      if (signal?.aborted) throw new EnvironmentError('ALGORITHM_ABORTED', 'Experiment was stopped by the user.');
      const candidates: PlacementCandidate[] = [];
      const maxAttempts = config.task.targetTowerCount * 160;
      for (let attempt = 0; attempt < maxAttempts && candidates.length < config.task.targetTowerCount; attempt += 1) {
        const candidate = {
          x: random.range(terrain.origin.x, terrain.origin.x + terrain.width),
          z: random.range(terrain.origin.z, terrain.origin.z + terrain.depth),
          rotationY: random.range(0, Math.PI * 2),
        };
        if (environment.validateCandidate(candidate, candidates).valid) candidates.push(candidate);
      }
      const evaluation = environment.evaluatePlacementSet(candidates);
      if (!best || evaluation.score > best.score) best = evaluation;
      history.push({ stepIndex: iteration, action: { type: 'CANDIDATE_LAYOUT', iteration }, actionValid: evaluation.metrics.constraintViolations === 0 && evaluation.metrics.towerCount === config.task.targetTowerCount, reward: evaluation.score, coverage: evaluation.metrics.coverageRatio, overlap: evaluation.metrics.overlapRatio, cost: evaluation.metrics.totalCost, violations: evaluation.metrics.constraintViolations });
      if (iteration % 10 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!best) throw new EnvironmentError('EXPERIMENT_FAILED', 'Random Search produced no candidates.');
    return { algorithm: this.name, terrainId: terrain.terrainId, seed: config.seed, bestScore: best.score, metrics: best.metrics, solution: { assets: best.assets }, history };
  }
}
