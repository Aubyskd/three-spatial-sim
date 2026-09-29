import type { RoadTraversalProfileName } from '../roads/RoadTraversalProfile';
import type { SpatialPoint } from '../spatial/SpatialPoint';
import type { Vector3Data } from '../types';

export interface GraphNode extends SpatialPoint {
  type: 'graph-node';
  originalGroundPosition: Vector3Data;
  snappedRoadPosition: Vector3Data;
  snapDistance: number;
  roadEdgeId: string;
}
export interface GraphEdge { id: string; source: string; target: string; cost: number; roadPath: Vector3Data[]; roadEdgeIds: string[]; }
export interface SpatialGraph {
  type: 'reachability-graph'; terrainId: string; terrainRevision: number; roadNetworkRevision: number;
  traversalProfile: RoadTraversalProfileName; onewayEnforced: false; directed: false;
  nodes: GraphNode[]; edges: GraphEdge[]; adjacencyMatrix: number[][]; costMatrix: (number | null)[][];
}
export interface GraphBuildProgress { completedPairs: number; totalPairs: number; currentPair?: [string, string]; }
export interface GraphBuildConfig { maxRoadSnapDistance: number; yieldEveryPairs?: number; }
export class GraphBuildError extends Error {
  constructor(readonly code: 'NO_NEARBY_TRAVERSABLE_ROAD' | 'INVALID_NODE' | 'CANCELLED' | 'ROAD_NETWORK_DISCONNECTED' | 'NO_PATH', message: string, readonly nodeId?: string) { super(message); this.name = 'GraphBuildError'; }
}
