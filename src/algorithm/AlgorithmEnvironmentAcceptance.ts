import type { Environment } from './Environment';
import type { ConstraintValidation } from './constraint/ConstraintResult';
import { ALGORITHM_DEFAULTS } from './EnvironmentConfig';
import { ExperimentRunner } from './experiment/ExperimentRunner';
import type { ExperimentConfig } from './experiment/ExperimentConfig';

export interface AcceptanceReport {
  passed: boolean;
  checks: Record<string, boolean>;
  details: Record<string, unknown>;
}

function failures(validation: ConstraintValidation): string[] { return validation.results.filter((result) => !result.valid).map((result) => result.constraintId); }

/** Optional deterministic smoke test. It uses Environment APIs only and never touches rendering or UI. */
export async function runAlgorithmEnvironmentAcceptance(environment: Environment): Promise<AcceptanceReport> {
  const observation = await environment.reset({ terrainId: 'terrain-01', seed: 42, task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: 2 }, episode: { maxSteps: 4, maxAssets: 2 }, rendering: { enabled: false }, assets: { resetPlacedAssets: true } });
  const terrain = environment.getTerrainData();
  if (!terrain) throw new Error('Acceptance test requires terrain-01.');
  const valid: Array<{ x: number; z: number }> = [];
  let water: { x: number; z: number } | undefined;
  let slope: { x: number; z: number } | undefined;
  for (let row = 0; row < 36; row += 1) for (let col = 0; col < 36; col += 1) {
    const point = { x: terrain.origin.x + ((col + 0.5) / 36) * terrain.width, z: terrain.origin.z + ((row + 0.5) / 36) * terrain.depth };
    const validation = environment.validateAction({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: point });
    const failed = failures(validation);
    if (validation.valid && valid.every((other) => Math.hypot(other.x - point.x, other.z - point.z) >= 5.2) && valid.length < 2) valid.push(point);
    if (!water && failed.includes('NOT_IN_WATER')) water = point;
    if (!slope && failed.includes('MAX_SLOPE')) slope = point;
  }
  if (valid.length < 2 || !water || !slope) throw new Error('Acceptance test could not locate representative terrain samples.');
  const outside = environment.validateAction({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: { x: terrain.origin.x - 1, z: terrain.origin.z - 1 } });
  const waterStep = await environment.step({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: water });
  const first = await environment.step({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: valid[0] });
  const close = await environment.step({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: { x: valid[0].x + 0.1, z: valid[0].z + 0.1 } });
  const second = await environment.step({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: valid[1] });
  await environment.reset({ terrainId: 'terrain-01', seed: 42, task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: 5 }, episode: { maxSteps: 1, maxAssets: 5 }, rendering: { enabled: false }, assets: { resetPlacedAssets: true } });
  const truncated = await environment.step({ type: 'NO_OP' });
  const runner = new ExperimentRunner(environment);
  const experimentConfig: ExperimentConfig = { experimentId: 'acceptance-seed-42', terrainId: 'terrain-01', seed: 42, algorithm: 'Random Search', task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: 3 }, maxSteps: 12, iterations: 10, rendering: 'fast', objectiveWeights: { ...ALGORITHM_DEFAULTS.objectiveWeights } };
  const experimentA = await runner.run(experimentConfig);
  const jsonExport = JSON.parse(runner.exportJson()) as { experimentId?: string };
  const csvExport = runner.exportCsv();
  const experimentB = await runner.run(experimentConfig);
  environment.setRenderingEnabled(true);
  const checks = {
    resetObservation: observation.terrain.id === 'terrain-01' && observation.stepIndex === 0,
    insideTerrain: failures(outside).includes('INSIDE_TERRAIN'),
    waterRejected: !waterStep.info.actionValid && Boolean(waterStep.info.constraints?.some((item) => item.constraintId === 'NOT_IN_WATER' && !item.valid)),
    slopeRejected: failures(environment.validateAction({ type: 'PLACE_ASSET', assetType: 'signal-tower', position: slope })).includes('MAX_SLOPE'),
    legalPlacement: first.info.actionValid && first.info.metrics.towerCount === 1,
    collisionRejected: !close.info.actionValid && Boolean(close.info.constraints?.some((item) => item.constraintId === 'NO_COLLISION' && !item.valid)),
    minimumDistanceRejected: Boolean(close.info.constraints?.some((item) => item.constraintId === 'MIN_TOWER_DISTANCE' && !item.valid)),
    metricsValid: second.info.metrics.coverageRatio >= 0 && second.info.metrics.coverageRatio <= 1 && second.info.metrics.totalCost === 2,
    terminatesAtTarget: second.terminated && !second.truncated,
    truncatesAtMaxSteps: !truncated.terminated && truncated.truncated,
    actionSpace: environment.getAvailableActions().length === 4,
    randomSearchCompletes: experimentA.metrics.towerCount === 3 && experimentA.history.length === 10,
    seedReproducible: experimentA.bestScore === experimentB.bestScore && JSON.stringify(experimentA.solution.assets) === JSON.stringify(experimentB.solution.assets),
    jsonExport: jsonExport.experimentId === experimentConfig.experimentId,
    csvExport: csvExport.includes('terrainRevision') && csvExport.includes(experimentConfig.experimentId),
  };
  return { passed: Object.values(checks).every(Boolean), checks, details: { water, slope, valid, finalMetrics: second.info.metrics, waterReward: waterStep.reward, closeReward: close.reward, experimentMetrics: experimentA.metrics, experimentBestScore: experimentA.bestScore } };
}
