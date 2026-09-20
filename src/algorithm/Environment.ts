import type { MultiTerrainSimulation } from '../core/MultiTerrainSimulation';
import type { PlacementValidation } from '../assets/PlacementValidator';
import type { PlacedAsset, TerrainData, TerrainDescriptor } from '../terrain/TerrainTypes';
import type { PlacementCandidate, SpatialEvaluation } from '../evaluation/SpatialEvaluator';
import { SpatialEvaluator } from '../evaluation/SpatialEvaluator';
import type { EnvironmentAction } from './action/Action';
import { ActionValidator } from './action/ActionValidator';
import type { AvailableAction } from './action/ActionSpace';
import { ConstraintEngine } from './constraint/ConstraintEngine';
import type { ConstraintValidation } from './constraint/ConstraintResult';
import { ALGORITHM_DEFAULTS, resolveEnvironmentConfig, type EnvironmentConfig, type ResolvedEnvironmentConfig } from './EnvironmentConfig';
import { EnvironmentError } from './EnvironmentError';
import type { OptimizationMetrics } from './metrics/Metrics';
import { EMPTY_METRICS } from './metrics/Metrics';
import { MetricsCollector } from './metrics/MetricsCollector';
import { ObjectiveEngine } from './objective/ObjectiveEngine';
import { RewardCalculator } from './objective/RewardCalculator';
import { ObservationBuilder } from './state/ObservationBuilder';
import type { GridObservation, Observation } from './state/Observation';
import type { WorldState } from './state/WorldState';
import { SignalTowerOptimizationTask } from '../tasks/SignalTowerOptimizationTask';

export interface StepResult {
  observation: Observation;
  reward: number;
  terminated: boolean;
  truncated: boolean;
  info: { actionValid: boolean; constraints?: ConstraintValidation['results']; metrics: OptimizationMetrics };
}

/** Standard, UI-independent algorithm façade over the current simulation runtime. */
export class Environment {
  private config?: ResolvedEnvironmentConfig;
  private readonly observationBuilder = new ObservationBuilder();
  private readonly validator = new ActionValidator(new ConstraintEngine());
  private readonly collector = new MetricsCollector();
  private task?: SignalTowerOptimizationTask;
  private evaluator?: SpatialEvaluator;
  private objective?: ObjectiveEngine;
  private metrics: OptimizationMetrics = { ...EMPTY_METRICS };
  private stepIndex = 0;
  private episodeViolations = 0;
  private terminated = false;
  private truncated = false;

  constructor(private readonly simulation: MultiTerrainSimulation) {}

  async reset(config?: EnvironmentConfig): Promise<Observation> {
    const terrainId = config?.terrainId ?? this.simulation.getActiveTerrainId();
    if (!terrainId) throw new EnvironmentError('TERRAIN_NOT_READY', 'No terrain is active.');
    const resolved = resolveEnvironmentConfig(config ?? { terrainId, task: { type: 'SIGNAL_TOWER_OPTIMIZATION' } });
    if (resolved.task.type !== 'SIGNAL_TOWER_OPTIMIZATION') throw new EnvironmentError('INVALID_TASK', `Unsupported task: ${resolved.task.type}.`);
    if (this.simulation.isSwitching()) throw new EnvironmentError('ENVIRONMENT_NOT_READY', 'Terrain switching is still in progress.');
    if (this.simulation.getActiveTerrainId() !== terrainId) {
      const switched = await this.simulation.switchTerrain(terrainId);
      if (!switched) throw new EnvironmentError('TERRAIN_NOT_READY', `Could not switch to terrain ${terrainId}.`);
    }
    this.config = resolved;
    this.simulation.setRenderingEnabled(resolved.rendering.enabled);
    if (resolved.assets.resetPlacedAssets) await this.simulation.clearPlacedAssets();
    this.simulation.reset();
    this.stepIndex = 0; this.episodeViolations = 0; this.terminated = false; this.truncated = false; this.metrics = { ...EMPTY_METRICS }; this.collector.reset();
    this.task = new SignalTowerOptimizationTask(resolved.task.targetTowerCount);
    this.configureEvaluation();
    this.metrics = this.evaluate().metrics;
    return this.observe();
  }

  observe(): Observation {
    const terrain = this.requireTerrain();
    return this.observationBuilder.build(this.getState(), terrain, this.metrics);
  }

  async step(action: EnvironmentAction): Promise<StepResult> {
    this.requireReady();
    if (this.terminated || this.truncated) throw new EnvironmentError('EPISODE_TERMINATED', 'Call reset() before stepping a finished episode.');
    const previousScore = this.objective?.evaluate(this.metrics).score ?? 0;
    const validation = this.validateAction(action);
    let actionValid = validation.valid;
    if (actionValid && action.type === 'PLACE_ASSET' && this.simulation.getPlacedAssets().length >= this.requireConfig().episode.maxAssets) {
      actionValid = false;
      validation.results.push({ constraintId: 'MAX_ASSETS', valid: false, reason: 'Episode asset limit has been reached.', metrics: { maxAssets: this.requireConfig().episode.maxAssets } });
    }
    if (actionValid) actionValid = this.applyAction(action, validation);
    if (!actionValid) this.episodeViolations += Math.max(1, validation.results.filter((result) => !result.valid).length);
    this.stepIndex += 1;
    const evaluation = this.evaluate();
    this.metrics = { ...evaluation.metrics, constraintViolations: this.episodeViolations };
    const score = this.objective?.evaluate(this.metrics).score ?? evaluation.score;
    const reward = actionValid ? score - previousScore : -this.requireConfig().objectiveWeights.violations * Math.max(1, validation.results.filter((result) => !result.valid).length);
    this.terminated = this.task?.isTerminated(this.metrics, action) ?? false;
    this.truncated = !this.terminated && this.stepIndex >= this.requireConfig().episode.maxSteps;
    this.collector.record({ stepIndex: this.stepIndex, action, actionValid, reward, coverage: this.metrics.coverageRatio, overlap: this.metrics.overlapRatio, cost: this.metrics.totalCost, violations: this.metrics.constraintViolations });
    return { observation: this.observe(), reward, terminated: this.terminated, truncated: this.truncated, info: { actionValid, constraints: validation.results, metrics: { ...this.metrics } } };
  }

  evaluate(): SpatialEvaluation {
    const evaluator = this.requireEvaluator();
    const assets = this.simulation.getPlacedAssets();
    const result = evaluator.evaluatePlacementSet(assets.map((asset) => ({ x: asset.position.x, z: asset.position.z, rotationY: asset.rotationY })));
    this.metrics = { ...result.metrics, constraintViolations: this.episodeViolations };
    return { ...result, metrics: { ...this.metrics }, score: this.objective?.evaluate(this.metrics).score ?? result.score };
  }

  getMetrics(): OptimizationMetrics { return { ...this.metrics }; }
  getEpisodeHistory(): ReturnType<MetricsCollector['getHistory']> { return this.collector.getHistory(); }
  isTerminated(): boolean { return this.terminated; }
  isTruncated(): boolean { return this.truncated; }

  getState(): WorldState {
    const terrain = this.requireTerrain();
    const runtime = this.simulation.observe();
    return {
      terrainId: terrain.terrainId,
      terrainRevision: terrain.revision,
      stepIndex: this.stepIndex,
      placedAssets: this.simulation.getPlacedAssets(),
      agentState: structuredClone(runtime.agent),
      targetState: runtime.target ? structuredClone(runtime.target) : undefined,
      runtimeStatus: this.simulation.isSwitching() ? 'SWITCHING' : this.terminated ? 'TERMINATED' : this.truncated ? 'TRUNCATED' : 'READY',
    };
  }

  validateAction(action: EnvironmentAction): ConstraintValidation {
    const terrain = this.requireTerrain();
    return this.validator.validate(action, { terrain, assets: this.simulation.getPlacedAssets(), semanticAt: (x, z) => this.simulation.getSemanticInfo(x, z) });
  }

  getAvailableActions(): AvailableAction[] { this.requireReady(); return this.task?.getAvailableActions() ?? []; }
  getAvailableTerrains(): readonly TerrainDescriptor[] { return this.simulation.getAvailableTerrains(); }
  getActiveTerrainId(): string | undefined { return this.simulation.getActiveTerrainId(); }

  async switchTerrain(terrainId: string): Promise<boolean> {
    const switched = await this.simulation.switchTerrain(terrainId);
    if (switched) { this.stepIndex = 0; this.metrics = { ...EMPTY_METRICS }; this.configureEvaluation(); this.metrics = this.evaluate().metrics; }
    return switched;
  }

  reloadCurrentTerrain(): Promise<boolean> { return this.simulation.reloadCurrentTerrain(); }
  getTerrainData(): TerrainData | undefined { return this.simulation.getTerrainData(); }
  sampleTerrainHeight(x: number, z: number): number { return this.simulation.sampleTerrainHeight(x, z); }
  getTerrainSlope(x: number, z: number): number { return this.simulation.getTerrainSlope(x, z); }
  getSemanticAt(x: number, z: number): string | undefined { return this.simulation.getSemanticAt(x, z); }
  validatePlacement(definitionId: string, x: number, z: number): PlacementValidation { return this.simulation.validatePlacement(definitionId, x, z); }
  placeAsset(definitionId: string, x: number, z: number, rotationY = 0): PlacedAsset | null { return this.simulation.placeAsset(definitionId, x, z, rotationY); }
  removeAsset(id: string): boolean { return this.simulation.removeAsset(id); }
  getPlacedAssets(): PlacedAsset[] { return this.simulation.getPlacedAssets(); }
  setRenderingEnabled(enabled: boolean): void { this.simulation.setRenderingEnabled(enabled); }
  showCoverageDebug(assets: readonly PlacedAsset[]): void { this.simulation.showCoverageDebug(assets); }
  clearCoverageDebug(): void { this.simulation.clearCoverageDebug(); }

  evaluatePlacementSet(candidates: readonly PlacementCandidate[]): SpatialEvaluation { return this.requireEvaluator().evaluatePlacementSet(candidates); }
  validateCandidate(candidate: PlacementCandidate, accepted: readonly PlacementCandidate[] = []): ReturnType<SpatialEvaluator['validateCandidate']> { return this.requireEvaluator().validateCandidate(candidate, accepted); }

  async applySolution(assets: readonly PlacedAsset[]): Promise<void> {
    await this.simulation.clearPlacedAssets();
    for (const asset of assets) {
      const validation = this.validateAction({ type: 'PLACE_ASSET', assetType: asset.definitionId, position: { x: asset.position.x, z: asset.position.z }, rotationY: asset.rotationY });
      if (!validation.valid) {
        await this.simulation.clearPlacedAssets();
        throw new EnvironmentError('CONSTRAINT_FAILED', `Best solution could not be applied at (${asset.position.x}, ${asset.position.z}).`, validation.results);
      }
      const runtimeAsset = this.simulation.placeAsset(asset.definitionId, asset.position.x, asset.position.z, asset.rotationY);
      if (!runtimeAsset) { await this.simulation.clearPlacedAssets(); throw new EnvironmentError('CONSTRAINT_FAILED', 'Runtime rejected a statically valid asset.', validation.results); }
    }
    this.metrics = this.evaluate().metrics;
  }

  getGlobalGrid(rows: number = ALGORITHM_DEFAULTS.coverageGridResolution, cols: number = rows): GridObservation {
    const terrain = this.requireTerrain();
    return this.observationBuilder.buildGrid(terrain, (x, z) => this.simulation.getSemanticInfo(x, z), this.simulation.getPlacedAssets(), rows, cols);
  }
  getHeightGrid(rows?: number, cols?: number): number[][] { return this.getGlobalGrid(rows, cols).height; }
  getSemanticGrid(rows?: number, cols?: number): number[][] { return this.getGlobalGrid(rows, cols).semantic; }
  getOccupancyGrid(rows?: number, cols?: number): number[][] { return this.getGlobalGrid(rows, cols).occupied; }
  getLocalGrid(center: { x: number; z: number }, radius: number, rows: number = 16, cols: number = rows): GridObservation {
    const terrain = this.requireTerrain();
    const bounds = {
      minX: Math.max(terrain.origin.x, center.x - radius), maxX: Math.min(terrain.origin.x + terrain.width, center.x + radius),
      minZ: Math.max(terrain.origin.z, center.z - radius), maxZ: Math.min(terrain.origin.z + terrain.depth, center.z + radius),
    };
    return this.observationBuilder.buildGrid(terrain, (x, z) => this.simulation.getSemanticInfo(x, z), this.simulation.getPlacedAssets(), rows, cols, bounds);
  }

  private applyAction(action: EnvironmentAction, validation: ConstraintValidation): boolean {
    if (action.type === 'NO_OP') return true;
    if (action.type === 'REMOVE_ASSET') return this.simulation.removeAsset(action.assetId);
    if (action.type === 'MOVE_ASSET') return Boolean(this.simulation.moveAsset(action.assetId, action.position.x, action.position.z, action.rotationY ?? 0));
    const placed = this.simulation.placeAsset(action.assetType, action.position.x, action.position.z, action.rotationY ?? 0);
    if (!placed) validation.results.push({ constraintId: 'RUNTIME_PLACEMENT', valid: false, reason: 'Runtime placement rejected the action.' });
    return Boolean(placed);
  }

  private configureEvaluation(): void {
    const terrain = this.requireTerrain();
    const config = this.config ?? resolveEnvironmentConfig({ terrainId: terrain.terrainId, task: { type: 'SIGNAL_TOWER_OPTIMIZATION' } });
    this.config = config; this.task = this.task ?? new SignalTowerOptimizationTask(config.task.targetTowerCount);
    this.objective = new ObjectiveEngine(new RewardCalculator(config.objectiveWeights, config.task.targetTowerCount));
    this.evaluator = new SpatialEvaluator({ terrain, semanticAt: (x, z) => this.simulation.getSemanticInfo(x, z) }, config.objectiveWeights, config.task.targetTowerCount);
  }
  private requireReady(): void { if (this.simulation.isSwitching()) throw new EnvironmentError('ENVIRONMENT_NOT_READY', 'Terrain switching is still in progress.'); this.requireTerrain(); if (!this.config) this.configureEvaluation(); }
  private requireTerrain(): TerrainData { const terrain = this.simulation.getTerrainData(); if (!terrain) throw new EnvironmentError('TERRAIN_NOT_READY', 'No active TerrainData is available.'); return terrain; }
  private requireConfig(): ResolvedEnvironmentConfig { if (!this.config) this.configureEvaluation(); return this.config!; }
  private requireEvaluator(): SpatialEvaluator { if (!this.evaluator) this.configureEvaluation(); return this.evaluator!; }
}
