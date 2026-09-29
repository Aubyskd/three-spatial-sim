import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SemanticMap } from '../src/semantic/SemanticMap';
import { TerrainEditor } from '../src/terrain/TerrainEditor';
import { hasTerrainSupport, isExplicitWater, isInferredWater, sampleTerrainHeight } from '../src/terrain/TerrainDataUtils';
import { chooseAgentSpawn } from '../src/terrain/AgentSpawn';
import { TerrainPhysicsWorld } from '../src/physics/TerrainPhysicsWorld';
import { Agent } from '../src/agent/Agent';
import { CharacterController } from '../src/physics/CharacterController';
import { TerrainSampler } from '../src/terrain/TerrainSampler';
import { RegionEditor } from '../src/ui/RegionEditor';
import { SemanticRegion } from '../src/semantic/SemanticRegion';
import { Pathfinder } from '../src/navigation/Pathfinder';
import type { NavigationCell } from '../src/navigation/NavMeshManager';
import { buildTerrainRegionOverlay, sampleVisualHeight, terrainLinePoints } from '../src/render/TerrainRegionOverlay';
import type { TerrainData } from '../src/terrain/TerrainTypes';
import { TerrainHeightProvider } from '../src/gis/TerrainHeightProvider';
import { BuildingLayer } from '../src/gis/BuildingLayer';
import { RoadLayer } from '../src/gis/RoadLayer';
import { buildingSemanticRegions, roadSemanticRegions, type BuildingCollection, type RoadCollection } from '../src/gis/VectorFeatureTypes';

function makeTerrain() {
  const land = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  land.rotation.x = -Math.PI / 2;
  land.updateMatrixWorld(true);

  // Two connected arms in one mesh. Its bounding rectangle also contains (2, 2),
  // which must remain dry rather than being filled by a rectangular overlay.
  const vertices: number[] = [];
  const indices: number[] = [];
  function addQuad(x0: number, x1: number, z0: number, z1: number) {
    const base = vertices.length / 3;
    vertices.push(x0, 0.2, z0, x0, 0.2, z1, x1, 0.2, z1, x1, 0.2, z0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  addQuad(-4, 4, -4, -1);
  addQuad(-4, -1, -1, 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const water = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  water.updateMatrixWorld(true);

  return new TerrainSampler().sample({
    terrainId: 'test-water', landMeshes: [land], waterMeshes: [water],
    bounds: new THREE.Box3().setFromObject(land), resolution: 32,
    sourceUrl: 'test.glb', inferWater: false, detectedMeshes: [],
  });
}

test('explicit water follows mesh footprint rather than its bounding rectangle', () => {
  const terrain = makeTerrain();
  assert.equal(terrain.source?.waterMode, 'explicit');
  assert.equal(isExplicitWater(terrain, 2, -2), true);
  assert.equal(isExplicitWater(terrain, -2, 2), true);
  assert.equal(isExplicitWater(terrain, 2, 2), false);
  const semantics = new SemanticMap(terrain.semanticRegions, undefined, terrain);
  assert.equal(semantics.regionAt(2, -2)?.type, 'water');
  assert.equal(semantics.regionAt(2, 2)?.type, 'grass');
  const authoredWater = { id: 'authored-water', type: 'water' as const, walkable: false,
    movementCost: 1000, shape: { kind: 'rectangle' as const, center: { x: 2, z: 2 }, width: 1, depth: 1 } };
  const withAuthoredWater = new SemanticMap([...terrain.semanticRegions, authoredWater], undefined, terrain);
  assert.equal(withAuthoredWater.regionAt(2, 2)?.type, 'water');
});

test('raising a flooded spot makes it dry and user-painted coverage becomes supported', () => {
  const terrain = makeTerrain();
  const editor = new TerrainEditor(terrain);
  editor.tool = 'raise'; editor.radius = 2; editor.strength = 1.5;
  assert.equal(isExplicitWater(terrain, 2, -2), true);
  assert.equal(editor.apply(2, -2), true);
  assert.equal(isExplicitWater(terrain, 2, -2), false);

  terrain.sampleCoverage!.fill(0);
  assert.equal(hasTerrainSupport(terrain, 0, 0), false);
  assert.equal(editor.apply(0, 0), true);
  assert.equal(hasTerrainSupport(terrain, 0, 0), true);
  editor.dispose();
});

test('an unlabelled GLB lowland is not automatically treated as water', () => {
  const terrain = makeTerrain();
  terrain.waterGrid = undefined;
  terrain.waterRegions = [];
  terrain.source = { type: 'glb', waterMode: 'none', waterLevel: 0.5 };
  assert.equal(isInferredWater(terrain, 0, 0), false);
  terrain.source.waterMode = 'inferred';
  assert.equal(isInferredWater(terrain, 0, 0), true);
});

test('flattening previously uncovered padding makes it supported even at the same height', () => {
  const terrain = makeTerrain();
  terrain.sampleCoverage!.fill(0);
  const editor = new TerrainEditor(terrain);
  editor.tool = 'flatten'; editor.radius = 2;
  editor.beginStroke(0, 0);
  assert.equal(hasTerrainSupport(terrain, 0, 0), false);
  assert.equal(editor.apply(0, 0), true);
  assert.equal(hasTerrainSupport(terrain, 0, 0), true);
  editor.dispose();
});

test('restricted polygon keeps its world coordinates, rejects crossing edges and survives undo', () => {
  const semantics = new SemanticMap([]);
  const editor = new RegionEditor(semantics);
  editor.begin();
  assert.equal(editor.finish().state, 'invalid');
  for (const point of [{ x: 1, z: 1 }, { x: 5, z: 1 }, { x: 5, z: 5 }]) assert.equal(editor.addPoint(point).added, true);
  assert.equal(editor.addPoint({ x: 2, z: 0 }).added, false); // Crosses the first edge.
  assert.equal(editor.undoPoint(), true);
  assert.equal(editor.addPoint({ x: 1, z: 5 }).added, true);
  const result = editor.finish();
  assert.equal(result.state, 'created');
  assert.equal(semantics.regionAt(2, 2)?.type, 'restricted');
  assert.equal(semantics.regionAt(1, 3)?.type, 'restricted');
  assert.equal(semantics.regionAt(8, 8), undefined);
  assert.equal(semantics.manual.all()[0].shape.kind, 'polygon');
  assert.equal(editor.enabled, false);
});

test('pathfinding detours around a thin Restrict strip between walkable grid centres', () => {
  const semantics = new SemanticMap([]);
  semantics.manual.addRestrictedRectangle({ x: 0.2, z: -1.2 }, { x: 0.4, z: 1.2 });
  const cells = new Map<string, NavigationCell>();
  const key = (x: number, z: number) => `${x},${z}`;
  for (let x = -3; x <= 3; x += 1) for (let z = -3; z <= 3; z += 1) {
    cells.set(key(x, z), { x, y: 0, z, size: 1 });
  }
  const nav = {
    cellSize: 1,
    isWalkable: (x: number, z: number) => cells.has(key(Math.round(x), Math.round(z))),
    getCell: (x: number, z: number) => cells.get(key(Math.round(x), Math.round(z))),
    neighbors: (cell: NavigationCell) => [...cells.values()].filter((other) =>
      Math.abs(other.x - cell.x) <= 1 && Math.abs(other.z - cell.z) <= 1 && other !== cell),
    key,
    // Recast's terrain-only mesh can suggest a straight path through a semantic restriction.
    computeRecastPath: () => [{ x: -2, y: 0.9, z: 0 }, { x: 2, y: 0.9, z: 0 }],
  };
  const pathfinder = new Pathfinder(nav, semantics);
  const start = { x: -2, y: 0.9, z: 0 };
  const target = { x: 2, y: 0.9, z: 0 };
  const result = pathfinder.findPath(start, target);
  assert.equal(result.success, true, result.reason);
  assert.equal(result.source, 'grid-fallback');
  assert.ok(result.path.some((point) => Math.abs(point.z) >= 2), 'path should go around an end of the strip');
  for (let i = 1; i < result.path.length; i += 1) {
    assert.equal(semantics.segmentIntersectsRestricted(result.path[i - 1], result.path[i]), false);
  }
  assert.equal(pathfinder.findPath(start, { x: 0.3, y: 0.9, z: 0 }).success, false);
});

test('restricted polygon crossings and boundary touches are detected even between samples', () => {
  const semantics = new SemanticMap([]);
  semantics.manual.addRestrictedPolygon([
    { x: 0.21, z: -0.5 }, { x: 0.23, z: -0.5 },
    { x: 0.23, z: 0.5 }, { x: 0.21, z: 0.5 },
  ]);
  assert.equal(semantics.segmentIntersectsRestricted({ x: 0, z: 0 }, { x: 1, z: 0 }), true);
  assert.equal(semantics.segmentIntersectsRestricted({ x: 0, z: 0.5 }, { x: 1, z: 0.5 }), true);
  assert.equal(semantics.segmentIntersectsRestricted({ x: 0, z: 1 }, { x: 1, z: 1 }), false);
});

test('GIS vector layers preserve holes, road width, height samples and obstacle semantics', () => {
  const buildings: BuildingCollection = {
    type: 'BuildingCollection', terrainId: 'vector-test', projectedCRS: 'EPSG:32613',
    coordinateConvention: { x: 'east', y: 'up', z: 'south' },
    features: [{
      id: 'building-1', type: 'building', baseHeight: 3, extrudeHeight: 9,
      rings: [
        [[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]],
        [[-0.5,-0.5],[-0.5,0.5],[0.5,0.5],[0.5,-0.5],[-0.5,-0.5]],
      ],
      terrainHeights: [[3,3,3,3,3],[3,3,3,3,3]], properties: {},
      sourceFeatureId: 'source-building', sourceType: 'Polygon', sourceProperties: {},
    }],
  };
  const roads: RoadCollection = {
    type: 'RoadCollection', terrainId: 'vector-test', projectedCRS: 'EPSG:32613',
    coordinateConvention: { x: 'east', y: 'up', z: 'south' },
    features: [{ id: 'road-1', type: 'road', centerline: [[-8,1.05,5],[0,2.05,5],[8,3.05,5]], width: 6,
      properties: { highway: 'residential' }, sourceFeatureId: 'source-road', sourceType: 'LineString', sourceProperties: {} }],
  };
  const buildingLayer = new BuildingLayer(buildings); const roadLayer = new RoadLayer(roads);
  try {
    assert.ok((buildingLayer.getCollisionMesh()?.vertices.length ?? 0) > 0);
    assert.ok((buildingLayer.getCollisionMesh()?.indices.length ?? 0) > 0);
    assert.ok(buildingLayer.root.getObjectByName('osm-buildings-merged'));
    assert.equal(buildingLayer.root.getObjectByName('osm-building-collision-debug')?.visible, false);
    assert.ok(roadLayer.root.getObjectByName('osm-roads-ribbon'));
    const semantics = new SemanticMap([...roadSemanticRegions(roads), ...buildingSemanticRegions(buildings)], { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    assert.equal(semantics.regionAt(0, 0)?.type, 'obstacle');
    assert.equal(semantics.regionAt(0, 5)?.type, 'road');
    assert.equal(semantics.segmentIntersectsBlocked({ x: -4, z: 0 }, { x: 4, z: 0 }), true);
  } finally { buildingLayer.dispose(); roadLayer.dispose(); }
});

test('TerrainHeightProvider uses the same south-positive bilinear grid mapping', () => {
  const terrain: TerrainData = {
    terrainId: 'height-provider', width: 20, depth: 20, rows: 3, cols: 3,
    origin: { x: -10, y: 0, z: -10 }, heights: new Float32Array([0,10,20,10,20,30,20,30,40]),
    minHeight: 0, maxHeight: 40, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 0,
  };
  const provider = new TerrainHeightProvider(terrain);
  assert.equal(provider.heightAt(-10, -10), 0);
  assert.equal(provider.heightAt(0, 0), 20);
  assert.equal(provider.heightAt(10, 10), 40);
  assert.ok(Number.isNaN(provider.heightAt(11, 0)));
});

test('restricted overlay follows the displayed terrain triangles, including after a height edit', () => {
  const data: TerrainData = {
    terrainId: 'offset-terrain', width: 12, depth: 12, rows: 3, cols: 3,
    origin: { x: 100, y: 0, z: -30 }, heights: new Float32Array([0, 8, 0, 3, 2, 5, 0, 6, 1]),
    minHeight: 0, maxHeight: 8, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 0,
  };
  const shape = { kind: 'polygon' as const, points: [
    { x: 101, z: -29 }, { x: 111, z: -29 }, { x: 111, z: -27 },
    { x: 105, z: -27 }, { x: 105, z: -19 }, { x: 101, z: -19 },
  ] };
  const region = new SemanticRegion({ id: 'test', type: 'restricted', walkable: false, movementCost: 1000, shape });
  const groundGeometry = new THREE.PlaneGeometry(data.width, data.depth, data.cols - 1, data.rows - 1);
  for (let i = 0; i < data.heights.length; i += 1) groundGeometry.attributes.position.setZ(i, data.heights[i]);
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(data.origin.x + data.width / 2, 0, data.origin.z + data.depth / 2);
  ground.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(104, 100, -26), new THREE.Vector3(0, -1, 0)).intersectObject(ground)[0];
  assert.ok(hit);
  assert.ok(Math.abs(hit.point.y - sampleVisualHeight(data, 104, -26)) < 1e-5);
  const before = buildTerrainRegionOverlay(shape, data);
  const positions = before.getAttribute('position');
  assert.ok(positions.count > 0);
  for (let i = 0; i < positions.count; i += 3) {
    const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
    const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
    assert.equal(region.contains(x, z), true);
  }
  for (let i = 0; i < positions.count; i += 1) {
    assert.ok(Math.abs(positions.getY(i) - sampleVisualHeight(data, positions.getX(i), positions.getZ(i)) - 0.08) < 1e-5);
  }
  const original = sampleVisualHeight(data, 104, -26);
  data.heights[4] += 10; data.revision += 1;
  const after = buildTerrainRegionOverlay(shape, data);
  assert.notEqual(sampleVisualHeight(data, 104, -26), original);
  const line = terrainLinePoints(data, shape.points, true);
  assert.ok(line.length > shape.points.length);
  assert.ok(line.every((point) => Math.abs(point.y - sampleVisualHeight(data, point.x, point.z) - 0.16) < 1e-5));
  data.sampleCoverage = new Uint8Array(9);
  const unsupported = buildTerrainRegionOverlay(shape, data);
  assert.equal(unsupported.getAttribute('position').count, 0);
  unsupported.dispose();
  before.dispose(); after.dispose(); groundGeometry.dispose();
});

test('coarse DEM spawn height matches the actual collision surface instead of sinking below it', async () => {
  const terrain: TerrainData = {
    terrainId: 'dem-spawn', width: 1200, depth: 1200, rows: 2, cols: 2,
    origin: { x: 100, y: 0, z: -300 }, heights: new Float32Array([0, 80, 80, 0]),
    minHeight: 0, maxHeight: 80, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 0,
  };
  const physics = await TerrainPhysicsWorld.create(terrain);
  try {
    physics.step(1 / 60);
    const x = 700; const z = 300;
    const hit = physics.world.castRay(new physics.rapier.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 }), 300, true);
    assert.ok(hit);
    const groundHeight = 200 - hit.timeOfImpact;
    assert.ok(Math.abs(sampleTerrainHeight(terrain, x, z) - groundHeight) < 1e-4);
    const spawn = chooseAgentSpawn(terrain, [{ x: 150, z: -250 }, { x, z }]);
    assert.ok(spawn);
    assert.equal(spawn.x, x); // Prefer the centre rather than the first corner cell.
    assert.ok(spawn.y - 0.9 > groundHeight);
    assert.equal(chooseAgentSpawn(terrain, []), null);
  } finally { physics.dispose(); }
});

test('kilometre-scale overview shows an agent locator without changing capsule scale', () => {
  const agent = new Agent({ x: 0, y: 80.95, z: 0 });
  const camera = new THREE.PerspectiveCamera(52, 1.5, 0.05, 100000);
  camera.position.set(10000, 10000, 10000);
  agent.updateLocator(camera, 1000);
  assert.equal(agent.object3D.getObjectByName('agent-overview-locator')?.visible, true);
  assert.equal(agent.object3D.scale.x, 1);
  camera.position.set(8, 89, 8);
  agent.updateLocator(camera, 1000);
  assert.equal(agent.object3D.getObjectByName('agent-overview-locator')?.visible, false);
});

test('changing capsule height updates both visible body and collision shape', async () => {
  const terrain: TerrainData = {
    terrainId: 'capsule-scale', width: 10, depth: 10, rows: 2, cols: 2,
    origin: { x: -5, y: 0, z: -5 }, heights: new Float32Array(4),
    minHeight: 0, maxHeight: 0, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 0,
  };
  const physics = await TerrainPhysicsWorld.create(terrain);
  try {
    const spawn = { x: 0, y: 0.95, z: 0 };
    const agent = new Agent(spawn);
    const character = new CharacterController(physics, spawn);
    const body = agent.object3D.getObjectByName('agent-capsule');
    assert.ok(body);
    agent.object3D.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y;
    agent.setSizeScale(2);
    character.setSizeScale(2);
    character.reset({ x: 0, y: 1.85, z: 0 });
    agent.sync(character.position(), { x: 0, y: 0, z: 0 });
    agent.object3D.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y;
    assert.ok(Math.abs(after / before - 2) < 1e-5, `visible capsule heights ${before} → ${after}`);
    assert.ok(Math.abs(character.collider.radius() - 0.9) < 1e-5);
    assert.ok(Math.abs(character.collider.halfHeight() - 0.9) < 1e-5);
    assert.ok(Math.abs(character.position().y - 1.85) < 1e-5);
    assert.equal(agent.object3D.scale.x, 1); // The locator stays independently sized.
  } finally { physics.dispose(); }
});

test('OSM building trimesh follows a concave footprint instead of its bounding box', async () => {
  const terrain: TerrainData = {
    terrainId: 'building-collider', width: 20, depth: 20, rows: 2, cols: 2,
    origin: { x: -10, y: 0, z: -10 }, heights: new Float32Array(4),
    minHeight: 0, maxHeight: 0, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 0,
  };
  const physics = await TerrainPhysicsWorld.create(terrain);
  const buildings: BuildingCollection = {
    type: 'BuildingCollection', terrainId: 'building-collider', projectedCRS: 'EPSG:32613',
    coordinateConvention: { x: 'east', y: 'up', z: 'south' },
    features: [{
      id: 'concave-building', type: 'building', baseHeight: 0, extrudeHeight: 5,
      rings: [[[-2,-2],[2,-2],[2,-1],[-1,-1],[-1,2],[-2,2],[-2,-2]]],
      properties: {}, sourceFeatureId: 'concave-building', sourceType: 'Polygon', sourceProperties: {},
    }],
  };
  const layer = new BuildingLayer(buildings);
  try {
    physics.setBuildingColliderMesh(layer.getCollisionMesh());
    physics.step(1 / 60);
    const roofHit = physics.world.castRay(new physics.rapier.Ray({ x: -1.5, y: 6, z: 1 }, { x: 0, y: -1, z: 0 }), 10, true);
    const emptyCornerHit = physics.world.castRay(new physics.rapier.Ray({ x: 1, y: 6, z: 1 }, { x: 0, y: -1, z: 0 }), 10, true);
    assert.ok(roofHit && Math.abs(roofHit.timeOfImpact - 1) < 1e-4);
    assert.ok(emptyCornerHit && Math.abs(emptyCornerHit.timeOfImpact - 6) < 1e-4);
  } finally { layer.dispose(); physics.dispose(); }
});
