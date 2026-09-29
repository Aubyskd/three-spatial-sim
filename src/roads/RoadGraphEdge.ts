import type { Vector3Data } from '../types';

export interface RoadGraphEdgeProperties {
  highway?: string;
  name?: string;
  lanes?: string | number;
  oneway?: string | boolean;
  bridge?: string | boolean;
  tunnel?: string | boolean;
  layer?: string | number;
  [key: string]: unknown;
}

export interface RoadGraphEdge {
  id: string;
  source: string;
  target: string;
  geometry: Vector3Data[];
  length: number;
  roadId: string;
  properties: RoadGraphEdgeProperties;
}
