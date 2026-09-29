import type { RoadGraphEdge } from './RoadGraphEdge';
import type { RoadGraphNode } from './RoadGraphNode';
import type { RoadTraversalProfile } from './RoadTraversalProfile';

export class RoadGraph {
  readonly nodes = new Map<string, RoadGraphNode>();
  readonly edges = new Map<string, RoadGraphEdge>();
  readonly adjacency = new Map<string, string[]>();

  constructor(
    readonly terrainId: string,
    readonly revision: number,
    readonly traversalProfile: RoadTraversalProfile,
  ) {}

  addNode(node: RoadGraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) this.adjacency.set(node.id, []);
  }

  addEdge(edge: RoadGraphEdge): void {
    this.edges.set(edge.id, edge);
    this.adjacency.get(edge.source)?.push(edge.id);
    this.adjacency.get(edge.target)?.push(edge.id);
    this.nodes.get(edge.source)?.connectedEdgeIds.push(edge.id);
    this.nodes.get(edge.target)?.connectedEdgeIds.push(edge.id);
  }

  otherNode(edge: RoadGraphEdge, nodeId: string): string {
    return edge.source === nodeId ? edge.target : edge.source;
  }
}

export class RoadNetworkError extends Error {
  constructor(readonly code: 'INVALID_ROAD_GEOMETRY' | 'INVALID_INTERSECTION', message: string) {
    super(message); this.name = 'RoadNetworkError';
  }
}
