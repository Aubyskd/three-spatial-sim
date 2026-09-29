import type { Vector3Data } from '../types';
import type { RoadGraph } from './RoadGraph';
import type { RoadSnapResult } from './RoadSnapper';

export interface RoadPathResult { cost: number; roadPath: Vector3Data[]; roadEdgeIds: string[]; }

export class RoadPathfinder {
  constructor(private readonly graph: RoadGraph) {}

  findShortestPath(start: RoadSnapResult, end: RoadSnapResult): RoadPathResult | undefined {
    if (!start.valid || !end.valid || !start.roadEdgeId || !end.roadEdgeId || !start.snappedPosition || !end.snappedPosition) return undefined;
    const startEdge = this.graph.edges.get(start.roadEdgeId); const endEdge = this.graph.edges.get(end.roadEdgeId);
    if (!startEdge || !endEdge) return undefined;
    const distances = new Map<string, number>(); const previous = new Map<string, { node: string; edgeId: string }>(); const visited = new Set<string>();
    const startSeeds = [[startEdge.source, start.distanceFromSource ?? 0], [startEdge.target, start.distanceToTarget ?? 0]] as const;
    for (const [node, cost] of startSeeds) if (cost < (distances.get(node) ?? Infinity)) distances.set(node, cost);
    while (visited.size < this.graph.nodes.size) {
      let current: string | undefined; let currentDistance = Infinity;
      for (const [node, distance] of distances) if (!visited.has(node) && distance < currentDistance) { current = node; currentDistance = distance; }
      if (!current) break;
      visited.add(current);
      for (const edgeId of this.graph.adjacency.get(current) ?? []) {
        const edge = this.graph.edges.get(edgeId)!; const next = this.graph.otherNode(edge, current); const candidate = currentDistance + edge.length;
        if (candidate + 1e-9 < (distances.get(next) ?? Infinity)) { distances.set(next, candidate); previous.set(next, { node: current, edgeId }); }
      }
    }
    let goal = endEdge.source; let total = (distances.get(goal) ?? Infinity) + (end.distanceFromSource ?? 0);
    const viaTarget = (distances.get(endEdge.target) ?? Infinity) + (end.distanceToTarget ?? 0);
    if (viaTarget < total) { goal = endEdge.target; total = viaTarget; }
    let direct = Infinity;
    if (start.roadEdgeId === end.roadEdgeId) direct = Math.abs((start.distanceFromSource ?? 0) - (end.distanceFromSource ?? 0));
    if (Number.isFinite(direct) && direct <= total) return { cost: direct, roadPath: dedupe([{ ...start.snappedPosition }, { ...end.snappedPosition }]), roadEdgeIds: [start.roadEdgeId] };
    if (!Number.isFinite(total)) return undefined;
    const nodes: string[] = [goal]; const traversed: string[] = [];
    while (previous.has(nodes[0])) { const step = previous.get(nodes[0])!; traversed.unshift(step.edgeId); nodes.unshift(step.node); }
    const roadPath = [{ ...start.snappedPosition }, ...nodes.map((id) => ({ ...this.graph.nodes.get(id)!.position })), { ...end.snappedPosition }];
    return { cost: total, roadPath: dedupe(roadPath), roadEdgeIds: dedupeStrings([start.roadEdgeId, ...traversed, end.roadEdgeId]) };
  }
}

function dedupe(points: Vector3Data[]): Vector3Data[] { return points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y, point.z - points[index - 1].z) > 1e-8); }
function dedupeStrings(values: string[]): string[] { return values.filter((value, index) => index === 0 || value !== values[index - 1]); }
