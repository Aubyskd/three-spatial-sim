import type { RoadGraph } from '../roads/RoadGraph';
import { RoadPathfinder } from '../roads/RoadPathfinder';
import { RoadSnapper, type RoadSnapResult } from '../roads/RoadSnapper';
import type { SpatialPoint } from '../spatial/SpatialPoint';
import { GraphBuildError, type GraphBuildConfig, type GraphBuildProgress, type GraphEdge, type GraphNode, type SpatialGraph } from './GraphTypes';

export interface ReachabilityGraphEnvironment { terrainId: string; terrainRevision: number; }
export class ReachabilityGraphBuilder {
  private readonly snapper: RoadSnapper; private readonly pathfinder: RoadPathfinder;
  constructor(private readonly roadGraph: RoadGraph, private readonly environment: ReachabilityGraphEnvironment) { this.snapper = new RoadSnapper(roadGraph); this.pathfinder = new RoadPathfinder(roadGraph); }
  async buildGraph(points: SpatialPoint[], config: GraphBuildConfig, onProgress?: (progress: GraphBuildProgress) => void, signal?: AbortSignal): Promise<SpatialGraph> {
    if (!Number.isFinite(config.maxRoadSnapDistance) || config.maxRoadSnapDistance < 0) throw new GraphBuildError('INVALID_NODE', 'maxRoadSnapDistance must be finite and non-negative.');
    const snapped = points.map((point) => { const snap = this.snapper.snap(point.groundPosition, config.maxRoadSnapDistance); return { node: this.snapNode(point, config.maxRoadSnapDistance, snap), snap }; });
    const nodes = snapped.map(({ node }) => node); const size = nodes.length;
    const adjacencyMatrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const costMatrix: (number | null)[][] = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => row === column ? 0 : null));
    const edges: GraphEdge[] = []; const totalPairs = size * (size - 1) / 2; let completedPairs = 0; const yieldEvery = Math.max(1, Math.floor(config.yieldEveryPairs ?? 8)); onProgress?.({ completedPairs, totalPairs });
    for (let i = 0; i < size; i += 1) for (let j = i + 1; j < size; j += 1) {
      if (signal?.aborted) throw new GraphBuildError('CANCELLED', 'Graph build cancelled.');
      const path = this.pathfinder.findShortestPath(snapped[i].snap, snapped[j].snap);
      if (path) { edges.push({ id: `${nodes[i].id}--${nodes[j].id}`, source: nodes[i].id, target: nodes[j].id, cost: path.cost, roadPath: path.roadPath, roadEdgeIds: path.roadEdgeIds }); adjacencyMatrix[i][j] = adjacencyMatrix[j][i] = 1; costMatrix[i][j] = costMatrix[j][i] = path.cost; }
      completedPairs += 1; onProgress?.({ completedPairs, totalPairs, currentPair: [nodes[i].id, nodes[j].id] }); if (completedPairs % yieldEvery === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return { type: 'reachability-graph', terrainId: this.environment.terrainId, terrainRevision: this.environment.terrainRevision, roadNetworkRevision: this.roadGraph.revision, traversalProfile: this.roadGraph.traversalProfile.mode, onewayEnforced: false, directed: false, nodes: structuredClone(nodes), edges: structuredClone(edges), adjacencyMatrix, costMatrix };
  }
  snapNode(point: SpatialPoint, maxDistance: number, existingSnap?: RoadSnapResult): GraphNode {
    if (point.type !== 'graph-node' || !point.valid || ![point.groundPosition.x, point.groundPosition.y, point.groundPosition.z].every(Number.isFinite)) throw new GraphBuildError('INVALID_NODE', `Graph node ${point.id} is invalid.`, point.id);
    const snapped = existingSnap ?? this.snapper.snap(point.groundPosition, maxDistance);
    if (!snapped.valid || !snapped.snappedPosition || !snapped.roadEdgeId || snapped.distance === undefined) throw new GraphBuildError('NO_NEARBY_TRAVERSABLE_ROAD', `Graph node ${point.id} has no traversable road within ${maxDistance.toFixed(2)} m.`, point.id);
    return { ...structuredClone(point), type: 'graph-node', originalGroundPosition: { ...point.groundPosition }, snappedRoadPosition: { ...snapped.snappedPosition }, analysisPosition: { ...snapped.snappedPosition }, snapDistance: snapped.distance, roadEdgeId: snapped.roadEdgeId };
  }
}

export function graphToCsv(graph: SpatialGraph): string {
  const ids = graph.nodes.map((node) => node.id); const rows: string[][] = [
    ['section', 'metadata'], ['terrain_id', graph.terrainId], ['directed', String(graph.directed)], ['terrain_revision', String(graph.terrainRevision)], ['road_network_revision', String(graph.roadNetworkRevision)], ['traversal_profile', graph.traversalProfile], ['oneway_enforced', String(graph.onewayEnforced)], [],
    ['section', 'nodes'], ['id', 'original_x_m', 'original_y_m', 'original_z_m', 'road_x_m', 'road_y_m', 'road_z_m', 'snap_distance_m', 'road_edge_id'], ...graph.nodes.map((node) => [node.id, node.originalGroundPosition.x, node.originalGroundPosition.y, node.originalGroundPosition.z, node.snappedRoadPosition.x, node.snappedRoadPosition.y, node.snappedRoadPosition.z, node.snapDistance, node.roadEdgeId].map(String)), [],
    ['section', 'edges'], ['source', 'target', 'cost_m', 'road_edge_ids', 'shortest_road_path_json'], ...graph.edges.map((edge) => [edge.source, edge.target, edge.cost.toFixed(6), edge.roadEdgeIds.join('|'), JSON.stringify(edge.roadPath)]), [],
    ['section', 'adjacency_matrix'], ['node', ...ids], ...graph.adjacencyMatrix.map((row, index) => [ids[index], ...row.map(String)]), [], ['section', 'cost_matrix_m'], ['node', ...ids], ...graph.costMatrix.map((row, index) => [ids[index], ...row.map((value) => value === null ? 'null' : value.toFixed(6))]),
  ]; return rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
