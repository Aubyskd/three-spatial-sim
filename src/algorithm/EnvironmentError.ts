export type EnvironmentErrorCode =
  | 'INVALID_ACTION'
  | 'INVALID_TASK'
  | 'ENVIRONMENT_NOT_READY'
  | 'TERRAIN_NOT_READY'
  | 'EPISODE_TERMINATED'
  | 'CONSTRAINT_FAILED'
  | 'ALGORITHM_ABORTED'
  | 'EXPERIMENT_FAILED';

export class EnvironmentError extends Error {
  constructor(readonly code: EnvironmentErrorCode, message: string, readonly details?: unknown) {
    super(`${code}: ${message}`);
    this.name = 'EnvironmentError';
  }
}
