import type { AlgorithmRequest, AlgorithmResponse } from './MessageProtocol';

export interface AlgorithmBridge {
  handle(request: AlgorithmRequest): Promise<AlgorithmResponse>;
}
