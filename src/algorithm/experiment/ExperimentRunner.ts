import type { Environment } from '../Environment';
import { EnvironmentError } from '../EnvironmentError';
import { RandomSearchBaseline } from '../baseline/RandomSearchBaseline';
import type { ExperimentConfig } from './ExperimentConfig';
import type { ExperimentResult, OptimizationAlgorithm } from './ExperimentResult';

export type AlgorithmStatus = 'IDLE' | 'INITIALIZING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'ABORTED';

export class ExperimentRunner {
  private abortController?: AbortController;
  private result?: ExperimentResult;
  private _status: AlgorithmStatus = 'IDLE';
  private readonly algorithms = new Map<string, OptimizationAlgorithm>();

  constructor(private readonly environment: Environment) { this.register(new RandomSearchBaseline()); }
  get status(): AlgorithmStatus { return this._status; }
  get lastResult(): ExperimentResult | undefined { return this.result ? structuredClone(this.result) : undefined; }
  register(algorithm: OptimizationAlgorithm): void { this.algorithms.set(algorithm.name, algorithm); }

  async run(config: ExperimentConfig): Promise<ExperimentResult> {
    const algorithm = this.algorithms.get(config.algorithm);
    if (!algorithm) throw new EnvironmentError('EXPERIMENT_FAILED', `Algorithm is not registered: ${config.algorithm}.`);
    this.abortController = new AbortController(); this._status = 'INITIALIZING';
    try {
      await this.environment.reset({ terrainId: config.terrainId, seed: config.seed, task: config.task, episode: { maxSteps: config.maxSteps, maxAssets: config.task.targetTowerCount }, rendering: { enabled: config.rendering === 'visualization' }, assets: { resetPlacedAssets: true }, objectiveWeights: config.objectiveWeights });
      this._status = 'RUNNING';
      const algorithmResult = await algorithm.run(this.environment, config, this.abortController.signal);
      const terrain = this.environment.getTerrainData();
      if (!terrain) throw new EnvironmentError('TERRAIN_NOT_READY', 'Terrain disappeared during the experiment.');
      this.result = {
        experimentId: config.experimentId,
        terrainId: terrain.terrainId,
        terrainRevision: terrain.revision,
        seed: config.seed,
        algorithm: algorithm.name,
        algorithmVersion: config.algorithmVersion ?? algorithm.version,
        task: structuredClone(config.task),
        config: structuredClone(config),
        timestamp: new Date().toISOString(),
        bestScore: algorithmResult.bestScore,
        metrics: algorithmResult.metrics,
        solution: algorithmResult.solution,
        history: algorithmResult.history,
      };
      if (config.rendering === 'visualization') this.environment.showCoverageDebug(algorithmResult.solution.assets); else this.environment.clearCoverageDebug();
      this._status = 'COMPLETED';
      return structuredClone(this.result);
    } catch (error) {
      this._status = this.abortController.signal.aborted ? 'ABORTED' : 'FAILED';
      throw error;
    } finally {
      this.environment.setRenderingEnabled(true);
    }
  }

  stop(): void { this.abortController?.abort(); if (this._status === 'RUNNING' || this._status === 'INITIALIZING') this._status = 'ABORTED'; }
  async applyBestSolution(): Promise<void> {
    if (!this.result) throw new EnvironmentError('EXPERIMENT_FAILED', 'No completed solution is available.');
    await this.environment.applySolution(this.result.solution.assets);
  }

  exportJson(): string {
    if (!this.result) throw new EnvironmentError('EXPERIMENT_FAILED', 'No completed experiment is available.');
    return JSON.stringify(this.result, null, 2);
  }

  exportCsv(): string {
    if (!this.result) throw new EnvironmentError('EXPERIMENT_FAILED', 'No completed experiment is available.');
    const header = ['experimentId','terrainId','terrainRevision','seed','algorithm','bestScore','coverageRatio','overlapRatio','towerCount','totalCost','constraintViolations'];
    const r = this.result; const m = r.metrics;
    const row = [r.experimentId,r.terrainId,r.terrainRevision,r.seed,r.algorithm,r.bestScore,m.coverageRatio,m.overlapRatio,m.towerCount,m.totalCost,m.constraintViolations];
    return `${header.join(',')}\n${row.map((value) => JSON.stringify(value)).join(',')}\n`;
  }
}
