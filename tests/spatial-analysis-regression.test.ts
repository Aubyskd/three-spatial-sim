import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ReachabilityGraphBuilder, graphToCsv } from '../src/analysis/ReachabilityGraphBuilder';
import { VisibilityAnalyzer } from '../src/analysis/VisibilityAnalyzer';
import { DEFAULT_VISIBILITY_CONFIG } from '../src/analysis/VisibilityTypes';
import type { BuildingCollection, LocalRoadFeature, RoadCollection } from '../src/gis/VectorFeatureTypes';
import { RoadNetworkBuilder } from '../src/roads/RoadNetworkBuilder';
import { RoadPathfinder } from '../src/roads/RoadPathfinder';
import { RoadSnapper } from '../src/roads/RoadSnapper';
import { SemanticMap } from '../src/semantic/SemanticMap';
import { PhysicalPointPicker } from '../src/spatial/PhysicalPointPicker';
import { SpatialPointValidator } from '../src/spatial/SpatialPointValidator';
import type { SpatialPoint } from '../src/spatial/SpatialPoint';
import type { TerrainData } from '../src/terrain/TerrainTypes';
import { MultiTerrainSimulation } from '../src/core/MultiTerrainSimulation';
import { PointSelectionManager } from '../src/spatial/PointSelectionManager';

const terrain = terrainData(); const semantics = new SemanticMap([], { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, terrain);

test('disposing an old or cancelled terrain preserves active map picking and building occlusion', () => {
  // Exercise the production disposal method without creating a WebGL renderer.
  const simulation = Object.create(MultiTerrainSimulation.prototype);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(20, 20, 20); camera.lookAt(20, 0, 20); camera.updateMatrixWorld();
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) } as HTMLElement;
  const picker = new PhysicalPointPicker(camera, canvas);
  const analyzer = new VisibilityAnalyzer();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(50, 0, 50);
  const building = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  building.position.set(5, 2, 0); building.updateMatrixWorld(true);
  const disposed: string[] = [];
  const runtime = (id: string) => ({ visual: { mesh: ground }, nav: { dispose: () => disposed.push(`${id}:nav`) }, physics: { dispose: () => disposed.push(`${id}:physics`) } });
  const active = runtime('active');
  Object.assign(simulation, { runtime: active, physicalPointPicker: picker, visibilityAnalyzer: analyzer, visualBuilder: { dispose: () => {} } });
  picker.configure(ground, [building]); analyzer.setBuildingOccluders([building]);
  const observer = point('O1', 'observer', 0, 0, 0); const target = point('T1', 'target', 10, 0, 0);
  try {
    assert.equal(picker.pick(100, 100).valid, true);
    for (const stale of [runtime('old'), runtime('cancelled')]) {
      simulation.disposeRuntime(stale);
      const candidate = picker.pick(100, 100);
      const validation = new SpatialPointValidator(terrain, semantics).validate(candidate);
      assert.equal(validation.valid, true, 'active map must remain selectable after disposing another runtime');
      const selection = new PointSelectionManager();
      for (const type of ['observer', 'target', 'graph-node'] as const) {
        selection.startSelection({ type, requiredCount: 1 });
        assert.equal(selection.addPoint(validation.groundPosition!).added, true);
      }
      selection.dispose();
      assert.equal(analyzer.isVisible(observer, target), false, 'active buildings must still block visibility');
      assert.equal(picker.pickRay(new THREE.Vector3(5, 20, 0), new THREE.Vector3(0, -1, 0)).reason, 'BUILDING_SURFACE');
    }
    assert.deepEqual(disposed, ['old:nav', 'old:physics', 'cancelled:nav', 'cancelled:physics']);
    simulation.disposeRuntime(active);
    assert.equal(picker.pick(100, 100).reason, 'NO_TERRAIN_SUPPORT');
    assert.equal(analyzer.isVisible(observer, target), true);
  } finally {
    ground.geometry.dispose(); ground.material.dispose(); building.geometry.dispose(); building.material.dispose();
  }
});

test('physical picker rejects the nearest building instead of clicking through to terrain', () => {
  const camera = new THREE.PerspectiveCamera(); const picker = new PhysicalPointPicker(camera, {} as HTMLElement);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); ground.rotation.x = -Math.PI / 2; ground.position.set(50, 0, 50);
  const building = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()); building.position.set(50, 5, 50);
  picker.configure(ground, [building], []);
  assert.equal(picker.pickRay(new THREE.Vector3(50, 20, 50), new THREE.Vector3(0, -1, 0)).reason, 'BUILDING_SURFACE');
  const valid = picker.pickRay(new THREE.Vector3(20, 20, 20), new THREE.Vector3(0, -1, 0)); assert.equal(valid.valid, true); assert.equal(valid.surfaceType, 'terrain');
});

test('physical validation rejects outside, unsupported, building, physics and semantic points', () => {
  const candidate = (x: number, z: number) => ({ valid: true, surfaceType: 'terrain' as const, groundPosition: { x, y: 0, z } });
  assert.deepEqual(new SpatialPointValidator(terrain, semantics).validate(candidate(-1, 2)).reasons, ['OUTSIDE_TERRAIN']);
  const unsupported = terrainData(); unsupported.sampleCoverage![0] = 0;
  assert.deepEqual(new SpatialPointValidator(unsupported, semantics).validate(candidate(0, 0)).reasons, ['NO_TERRAIN_SUPPORT']);
  assert.deepEqual(new SpatialPointValidator(terrain, semantics, buildings()).validate(candidate(15, 15)).reasons, ['BUILDING_COLLISION']);
  assert.deepEqual(new SpatialPointValidator(terrain, semantics, undefined, { hasBuildingClearance: () => false }).validate(candidate(20, 20)).reasons, ['PHYSICS_COLLISION']);
  const forbidden = new SemanticMap([{ id: 'x', type: 'restricted', walkable: false, movementCost: 1000, shape: { kind: 'rectangle', center: { x: 30, z: 30 }, width: 5, depth: 5 } }], { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, terrain);
  assert.deepEqual(new SpatialPointValidator(terrain, forbidden).validate(candidate(30, 30)).reasons, ['SEMANTIC_FORBIDDEN']);
});

test('visibility requires valid ground points, defaults to 1.5m and remains configurable', () => {
  const analyzer = new VisibilityAnalyzer(); const observer = point('O1', 'observer', 0, 0, 0); const target = point('T1', 'target', 10, 0, 0);
  assert.equal(DEFAULT_VISIBILITY_CONFIG.observerHeightOffset, 1.5); assert.equal(analyzer.isVisible(observer, target), true);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); wall.position.set(5, 1, 0); wall.updateMatrixWorld(true); analyzer.setBuildingOccluders([wall]);
  assert.equal(analyzer.isVisible(observer, target), false); assert.equal(analyzer.isVisible(observer, target, { observerHeightOffset: 3, targetHeightOffset: 3 }), true);
  assert.throws(() => analyzer.isVisible({ ...observer, valid: false }, target), /invalid/);
});

test('road endpoints and a compatible crossing create nodes and split both roads', () => {
  const graph = roadGraph([road('a', [[0,0,5],[10,0,5]]), road('b', [[5,0,0],[5,0,10]])]);
  assert.equal([...graph.nodes.values()].filter((node) => node.kind === 'intersection').length, 1);
  assert.equal(graph.edges.size, 4); assert.equal(graph.nodes.size, 5);
});

test('nonintersecting roads stay disconnected and bridge, tunnel, or layer crossings do not create false intersections', () => {
  const separate = roadGraph([road('a', [[0,0,0],[10,0,0]]), road('b', [[0,0,5],[10,0,5]])]); assert.equal(separate.nodes.size, 4); assert.equal(separate.edges.size, 2);
  for (const properties of [{ bridge: 'yes' }, { tunnel: 'yes' }, { layer: 1 }]) {
    const graph = roadGraph([road('a', [[0,0,5],[10,0,5]], properties), road('b', [[5,0,0],[5,0,10]])]);
    assert.equal([...graph.nodes.values()].some((node) => node.kind === 'intersection'), false); assert.equal(graph.edges.size, 2);
  }
});

test('road snap preserves original/snapped positions, records distance, and rejects a far point', () => {
  const graph = roadGraph([road('a', [[0,0,0],[10,0,0]])]); const snapper = new RoadSnapper(graph);
  const near = snapper.snap({ x: 5, y: 0, z: 3 }, 4); assert.equal(near.valid, true); assert.deepEqual(near.originalPosition, { x: 5, y: 0, z: 3 }); assert.deepEqual(near.snappedPosition, { x: 5, y: 0, z: 0 }); assert.equal(near.distance, 3);
  assert.equal(snapper.snap({ x: 5, y: 0, z: 20 }, 10).reason, 'NO_NEARBY_TRAVERSABLE_ROAD');
});

test('Dijkstra chooses the shortest road-network route, not direct distance', () => {
  const graph = roadGraph([road('a', [[0,0,0],[5,0,0],[10,0,0]]), road('detour', [[0,0,0],[5,0,8],[10,0,0]])]);
  const snapper = new RoadSnapper(graph); const result = new RoadPathfinder(graph).findShortestPath(snapper.snap({ x: 0, y: 0, z: 0 }, 1), snapper.snap({ x: 10, y: 0, z: 0 }, 1));
  assert.ok(result); assert.equal(result!.cost, 10); assert.ok(result!.roadEdgeIds.length >= 2);
});

test('3D road length includes elevation gain', () => {
  const graph = roadGraph([road('mountain', [[0,0,0],[100,20,0]])]); const edge = [...graph.edges.values()][0]; assert.ok(Math.abs(edge.length - Math.sqrt(10400)) < 1e-8);
});

test('reachability graph is undirected, symmetric, keeps unreachable null and performs no MST', async () => {
  const network = roadGraph([road('connected', [[0,0,0],[10,0,0],[20,0,0],[30,0,0]]), road('island', [[100,0,0],[110,0,0]])]);
  const builder = new ReachabilityGraphBuilder(network, { terrainId: 'test', terrainRevision: 3 });
  const graph = await builder.buildGraph([graphPoint('P1', 0), graphPoint('P2', 10), graphPoint('P3', 20), graphPoint('P4', 30), graphPoint('P5', 100)], { maxRoadSnapDistance: 1 });
  assert.equal(graph.directed, false); assert.equal(graph.onewayEnforced, false); assert.equal(graph.edges.length, 6); // Four connected nodes retain N(N-1)/2 edges.
  assert.equal(graph.adjacencyMatrix[0][4], 0); assert.equal(graph.costMatrix[0][4], null); assert.deepEqual(graph.adjacencyMatrix, graph.adjacencyMatrix.map((row, i) => row.map((_, j) => graph.adjacencyMatrix[j][i]))); assert.deepEqual(graph.costMatrix, graph.costMatrix.map((row, i) => row.map((_, j) => graph.costMatrix[j][i])));
  assert.match(graphToCsv(graph), /road_network_revision/);
});

test('reachability builder rejects a graph node beyond the configured road snap threshold', async () => {
  const builder = new ReachabilityGraphBuilder(roadGraph([road('a', [[0,0,0],[10,0,0]])]), { terrainId: 'test', terrainRevision: 1 });
  await assert.rejects(() => builder.buildGraph([graphPoint('P1', 50)], { maxRoadSnapDistance: 2 }), (error: unknown) => (error as { code?: string }).code === 'NO_NEARBY_TRAVERSABLE_ROAD');
});

function point(id: string, type: SpatialPoint['type'], x: number, y: number, z: number): SpatialPoint { return { id, type, groundPosition: { x, y, z }, valid: true, validation: { reasons: [] } }; }
function graphPoint(id: string, x: number): SpatialPoint { return point(id, 'graph-node', x, 0, 0); }
function terrainData(): TerrainData { return { terrainId: 'test', width: 100, depth: 100, rows: 3, cols: 3, origin: { x: 0, y: 0, z: 0 }, heights: new Float32Array(9), sampleCoverage: new Uint8Array(9).fill(1), minHeight: 0, maxHeight: 0, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 1 }; }
function buildings(): BuildingCollection { return { type: 'BuildingCollection', terrainId: 'test', projectedCRS: 'local', coordinateConvention: { x: 'east', y: 'up', z: 'south' }, features: [{ id: 'b', type: 'building', rings: [[[10,10],[20,10],[20,20],[10,20],[10,10]]], properties: {}, baseHeight: 0, extrudeHeight: 10, sourceFeatureId: 'b', sourceType: 'Polygon', sourceProperties: {} }] }; }
function road(id: string, points: Array<[number,number,number]>, properties: Record<string, unknown> = {}): LocalRoadFeature { return { id, type: 'road', centerline: points, width: 4, properties: { highway: 'residential', ...properties }, sourceFeatureId: id, sourceType: 'LineString', sourceProperties: properties }; }
function roadGraph(features: LocalRoadFeature[]) { const collection: RoadCollection = { type: 'RoadCollection', terrainId: 'test', projectedCRS: 'local', coordinateConvention: { x: 'east', y: 'up', z: 'south' }, features }; return new RoadNetworkBuilder().build(collection, 'pedestrian', 7); }
