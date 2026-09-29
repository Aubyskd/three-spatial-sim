import type { Vector3Data } from '../types';

export interface RoadGraphNode {
  id: string;
  position: Vector3Data;
  connectedEdgeIds: string[];
  kind: 'endpoint' | 'intersection' | 'split';
  roadIds: string[];
  layer: number;
  bridge: boolean;
  tunnel: boolean;
}
