import type { EnvironmentAction } from '../algorithm/action/Action';
import type { EnvironmentConfig } from '../algorithm/EnvironmentConfig';

export type AlgorithmRequest =
  | { type: 'RESET'; requestId: string; payload?: { config?: EnvironmentConfig } }
  | { type: 'OBSERVE'; requestId: string; payload?: Record<string, never> }
  | { type: 'STEP'; requestId: string; payload: { action: EnvironmentAction } }
  | { type: 'EVALUATE'; requestId: string; payload?: Record<string, never> }
  | { type: 'SWITCH_TERRAIN'; requestId: string; payload: { terrainId: string } }
  | { type: 'GET_METRICS'; requestId: string; payload?: Record<string, never> };

export interface AlgorithmResponse {
  type: `${AlgorithmRequest['type']}_RESULT` | 'ERROR';
  requestId: string;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
