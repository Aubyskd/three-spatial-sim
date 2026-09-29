import type { LocalRoadFeature, RoadCollection } from '../gis/VectorFeatureTypes';
import type { Vector3Data } from '../types';
import { RoadGraph, RoadNetworkError } from './RoadGraph';
import type { RoadGraphEdgeProperties } from './RoadGraphEdge';
import { detectRoadIntersection, type RoadSegment } from './RoadIntersectionDetector';
import { isRoadTraversable, resolveTraversalProfile, roadBoolean, roadLayer, roadProperty, type RoadTraversalProfile, type RoadTraversalProfileName } from './RoadTraversalProfile';

interface MutableSegment extends RoadSegment { splits: number[]; }

export class RoadNetworkBuilder {
  build(collection: RoadCollection | undefined, profile: RoadTraversalProfileName | RoadTraversalProfile = 'pedestrian', revision = 0): RoadGraph {
    const resolved = resolveTraversalProfile(profile);
    const graph = new RoadGraph(collection?.terrainId ?? 'unknown', revision, resolved);
    const segments = this.createSegments((collection?.features ?? []).filter((road) => isRoadTraversable(road, resolved)));
    this.findIntersections(segments);
    const nodeByKey = new Map<string, string>(); let nextNode = 1; let nextEdge = 1;
    const getNode = (position: Vector3Data, segment: MutableSegment, t: number, kind: 'endpoint' | 'intersection' | 'split'): string => {
      const key = nodeKey(position, roadLayer(segment.road), roadBoolean(segment.road, 'bridge'), roadBoolean(segment.road, 'tunnel'));
      const existing = nodeByKey.get(key);
      if (existing) {
        const node = graph.nodes.get(existing)!;
        if (!node.roadIds.includes(segment.road.id)) node.roadIds.push(segment.road.id);
        if (kind === 'intersection') node.kind = 'intersection';
        return existing;
      }
      const id = `R${nextNode++}`; nodeByKey.set(key, id);
      graph.addNode({ id, position: { ...position }, connectedEdgeIds: [], kind: kindFor(t, kind), roadIds: [segment.road.id], layer: roadLayer(segment.road), bridge: roadBoolean(segment.road, 'bridge'), tunnel: roadBoolean(segment.road, 'tunnel') });
      return id;
    };
    for (const segment of segments) {
      const splitValues = uniqueSorted(segment.splits);
      for (let index = 1; index < splitValues.length; index += 1) {
        const t0 = splitValues[index - 1]; const t1 = splitValues[index];
        if (t1 - t0 < 1e-7) continue;
        const a = interpolate(segment, t0); const b = interpolate(segment, t1);
        const source = getNode(a, segment, t0, segment.splits.filter((value) => nearly(value, t0)).length > 1 ? 'intersection' : 'split');
        const target = getNode(b, segment, t1, segment.splits.filter((value) => nearly(value, t1)).length > 1 ? 'intersection' : 'split');
        if (source === target) continue;
        const geometry = [a, b];
        graph.addEdge({ id: `E${nextEdge++}`, source, target, geometry, length: distance3D(a, b), roadId: segment.road.id, properties: edgeProperties(segment.road) });
      }
    }
    return graph;
  }

  private createSegments(roads: LocalRoadFeature[]): MutableSegment[] {
    const segments: MutableSegment[] = [];
    for (const road of roads) for (let index = 1; index < road.centerline.length; index += 1) {
      const previous = road.centerline[index - 1]; const current = road.centerline[index];
      if (![...previous, ...current].every(Number.isFinite)) throw new RoadNetworkError('INVALID_ROAD_GEOMETRY', `Road ${road.id} contains a non-finite coordinate.`);
      const a = { x: previous[0], y: previous[1], z: previous[2] }; const b = { x: current[0], y: current[1], z: current[2] };
      if (distance3D(a, b) < 1e-7) continue;
      segments.push({ road, segmentIndex: index - 1, a, b, splits: [0, 1] });
    }
    return segments;
  }

  private findIntersections(segments: MutableSegment[]): void {
    const cells = new Map<string, number[]>(); const candidates = new Set<string>(); const cellSize = 50;
    segments.forEach((segment, index) => {
      const minX = Math.floor(Math.min(segment.a.x, segment.b.x) / cellSize); const maxX = Math.floor(Math.max(segment.a.x, segment.b.x) / cellSize);
      const minZ = Math.floor(Math.min(segment.a.z, segment.b.z) / cellSize); const maxZ = Math.floor(Math.max(segment.a.z, segment.b.z) / cellSize);
      for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
        const key = `${x}:${z}`; const bucket = cells.get(key) ?? [];
        for (const other of bucket) candidates.add(other < index ? `${other}:${index}` : `${index}:${other}`);
        bucket.push(index); cells.set(key, bucket);
      }
    });
    for (const pair of candidates) {
      const [aIndex, bIndex] = pair.split(':').map(Number); const a = segments[aIndex]; const b = segments[bIndex];
      if (a.road.id === b.road.id && Math.abs(a.segmentIndex - b.segmentIndex) <= 1) continue;
      const intersection = detectRoadIntersection(a, b);
      if (!intersection) continue;
      a.splits.push(intersection.tA); b.splits.push(intersection.tB);
      // Duplicate split entries mark an actual intersection for debug metadata.
      a.splits.push(intersection.tA); b.splits.push(intersection.tB);
    }
  }
}

function interpolate(segment: RoadSegment, t: number): Vector3Data { return { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t, z: segment.a.z + (segment.b.z - segment.a.z) * t }; }
function distance3D(a: Vector3Data, b: Vector3Data): number { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
function nearly(a: number, b: number): boolean { return Math.abs(a - b) < 1e-7; }
function uniqueSorted(values: number[]): number[] { return [...values].sort((a, b) => a - b).filter((value, index, list) => index === 0 || !nearly(value, list[index - 1])); }
function nodeKey(position: Vector3Data, layer: number, bridge: boolean, tunnel: boolean): string { const q = (value: number) => Math.round(value * 100) / 100; return `${q(position.x)}:${q(position.z)}:${layer}:${bridge ? 1 : 0}:${tunnel ? 1 : 0}`; }
function kindFor(t: number, preferred: 'endpoint' | 'intersection' | 'split'): 'endpoint' | 'intersection' | 'split' { return preferred === 'intersection' ? preferred : t < 1e-7 || t > 1 - 1e-7 ? 'endpoint' : 'split'; }
function edgeProperties(road: LocalRoadFeature): RoadGraphEdgeProperties {
  return { highway: stringOrUndefined(roadProperty(road, 'highway')), name: stringOrUndefined(roadProperty(road, 'name')), lanes: stringNumber(roadProperty(road, 'lanes')), oneway: stringBoolean(roadProperty(road, 'oneway')), bridge: stringBoolean(roadProperty(road, 'bridge')), tunnel: stringBoolean(roadProperty(road, 'tunnel')), layer: stringNumber(roadProperty(road, 'layer')) };
}
function stringOrUndefined(value: unknown): string | undefined { return value === undefined || value === null ? undefined : String(value); }
function stringNumber(value: unknown): string | number | undefined { return typeof value === 'string' || typeof value === 'number' ? value : undefined; }
function stringBoolean(value: unknown): string | boolean | undefined { return typeof value === 'string' || typeof value === 'boolean' ? value : undefined; }
