import type { Environment } from '../algorithm/Environment';
import { EnvironmentError } from '../algorithm/EnvironmentError';
import type { AlgorithmBridge } from './AlgorithmBridge';
import type { AlgorithmRequest, AlgorithmResponse } from './MessageProtocol';

export class LocalBridge implements AlgorithmBridge {
  constructor(private readonly environment: Environment) {}
  async handle(request: AlgorithmRequest): Promise<AlgorithmResponse> {
    try {
      let payload: unknown;
      switch (request.type) {
        case 'RESET': payload = await this.environment.reset(request.payload?.config); break;
        case 'OBSERVE': payload = this.environment.observe(); break;
        case 'STEP': payload = await this.environment.step(request.payload.action); break;
        case 'EVALUATE': payload = this.environment.evaluate(); break;
        case 'SWITCH_TERRAIN': payload = { switched: await this.environment.switchTerrain(request.payload.terrainId) }; break;
        case 'GET_METRICS': payload = this.environment.getMetrics(); break;
      }
      return { type: `${request.type}_RESULT`, requestId: request.requestId, payload };
    } catch (error) {
      const code = error instanceof EnvironmentError ? error.code : 'UNKNOWN';
      return { type: 'ERROR', requestId: request.requestId, error: { code, message: error instanceof Error ? error.message : String(error), details: error instanceof EnvironmentError ? error.details : undefined } };
    }
  }
}
