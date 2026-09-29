import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoordinateService, CoordinateServiceError, type TerrainSpatialMetadata } from '../src/spatial/CoordinateService';
import { TerrainPicker } from '../src/spatial/TerrainPicker';
import { TerrainHeightProvider } from '../src/gis/TerrainHeightProvider';
import { CoordinateAssetPlacer } from '../src/assets/CoordinateAssetPlacer';
import type { PlacementValidation } from '../src/assets/PlacementValidator';
import type { PlacedAsset, TerrainData } from '../src/terrain/TerrainTypes';

const ASPEN: TerrainSpatialMetadata = {
  terrainId: 'aspen_dem', projectedCRS: 'EPSG:32613', units: 'meters',
  localCoordinateConvention: { x: 'east', y: 'up', z: 'south' },
  localOrigin: { easting: 343380.5116724485, northing: 4339223.202138869, elevation: 2376.56298828125 },
  verticalScale: 1,
  localBounds: { origin: { x: -1892.2545737121254, y: 0, z: -1629.4414384746924 }, width: 3784.5091474241926, depth: 3258.8828769484535, minHeight: 0, maxHeight: 633.70068359375 },
};

function service(metadata = ASPEN): CoordinateService { const result = new CoordinateService(); result.configure(metadata); return result; }
function close(actual: number, expected: number, epsilon = 1e-6): void { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`); }

test('local/projected and projected/local round-trips preserve metres', () => {
  const coordinates = service(); const local = { x: 100, y: 25, z: -200 };
  const projected = coordinates.localToProjected(local);
  close(projected.easting, ASPEN.localOrigin.easting + 100);
  close(projected.northing, ASPEN.localOrigin.northing + 200);
  close(projected.elevation!, ASPEN.localOrigin.elevation + 25);
  assert.deepEqual(coordinates.projectedToLocal(projected), local);
});

test('local/geographic and geographic/local round-trips use active projected CRS', () => {
  const coordinates = service(); const local = { x: 328.41, y: 126.32, z: -417.21 };
  const geographic = coordinates.localToGeographic(local);
  assert.ok(geographic.longitude >= -180 && geographic.longitude <= 180);
  assert.ok(geographic.latitude >= -90 && geographic.latitude <= 90);
  const roundTrip = coordinates.geographicToLocal(geographic);
  close(roundTrip.x, local.x, 1e-4); close(roundTrip.y, local.y, 1e-8); close(roundTrip.z, local.z, 1e-4);
});

test('+Z is south and one world unit is one metre', () => {
  const coordinates = service();
  const north = coordinates.localToProjected({ x: 0, y: 0, z: -1 });
  const south = coordinates.localToProjected({ x: 0, y: 0, z: 1 });
  close(north.northing - south.northing, 2);
  const a = new THREE.Vector3(0, 0, 0); const b = new THREE.Vector3(100, 0, 0);
  assert.equal(a.distanceTo(b), 100);
});

test('terrain picker raycasts only its active terrain and returns world coordinates', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 10, 10); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial()); terrain.rotation.x = -Math.PI / 2; terrain.updateMatrixWorld(true);
  const element = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }) } as HTMLElement;
  const picker = new TerrainPicker(camera, element); picker.setActiveTerrain(terrain);
  const point = picker.pickTerrain(50, 50); assert.ok(point);
  close(point.x, 0, 1e-5); close(point.y, 0, 1e-5); close(point.z, 0, 1e-5);
  assert.equal(picker.pickTerrain(150, 50), null);
  terrain.geometry.dispose(); (terrain.material as THREE.Material).dispose();
});

test('coordinate bounds and invalid longitude/latitude are rejected explicitly', () => {
  const coordinates = service();
  assert.equal(coordinates.containsLocal({ x: 0, z: 0 }), true);
  assert.equal(coordinates.containsLocal({ x: 99999, z: 0 }), false);
  assert.throws(() => coordinates.assertWithinLocalBounds({ x: 99999, z: 0 }), (error: unknown) => error instanceof CoordinateServiceError && error.code === 'OUTSIDE_TERRAIN_BOUNDS');
  assert.throws(() => coordinates.geographicToLocal({ longitude: 181, latitude: 0 }), /Longitude/);
});

test('world/screen conversion uses camera projection without changing world scale', () => {
  const coordinates = service(); const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const viewport = { left: 10, top: 20, width: 200, height: 100 };
  const screen = coordinates.worldToScreen({ x: 0, y: 0, z: 0 }, camera, viewport);
  close(screen.x, 110); close(screen.y, 70);
  const ray = coordinates.screenToWorldRay(screen, camera, viewport);
  close(ray.direction.x, 0, 1e-6); close(ray.direction.y, 0, 1e-6); close(ray.direction.z, -1, 1e-6);
});

test('coordinate asset placement supports auto terrain Y and manual local Y', () => {
  const fixture = placementFixture();
  const auto = fixture.placer.preview({ assetType: 'signal-tower', coordinateMode: 'local', first: '2', second: '-3', yMode: 'auto' });
  assert.equal(auto.success, true); assert.equal(auto.local?.y, 10);
  const manual = fixture.placer.preview({ assetType: 'signal-tower', coordinateMode: 'local', first: 2, second: -3, yMode: 'manual', y: 25 });
  assert.equal(manual.success, true); assert.equal(manual.local?.y, 25);
});

test('coordinate asset placement deploys Local, Projected and Geographic inputs through validation', () => {
  const fixture = placementFixture();
  const local = fixture.placer.deploy({ assetType: 'signal-tower', coordinateMode: 'local', first: 1, second: 2, yMode: 'auto' });
  assert.equal(local.success, true); assert.deepEqual(local.asset?.position, { x: 1, y: 10, z: 2 });
  const projected = fixture.coordinates.localToProjected({ x: 3, y: 14, z: -4 });
  const projectedResult = fixture.placer.deploy({ assetType: 'signal-tower', coordinateMode: 'projected', first: projected.easting, second: projected.northing, yMode: 'manual', y: projected.elevation });
  assert.equal(projectedResult.success, true); close(projectedResult.asset!.position.x, 3); close(projectedResult.asset!.position.y, 14); close(projectedResult.asset!.position.z, -4);
  const geographic = fixture.coordinates.localToGeographic({ x: -2, y: 16, z: 5 });
  const geographicResult = fixture.placer.deploy({ assetType: 'signal-tower', coordinateMode: 'geographic', first: geographic.longitude, second: geographic.latitude, yMode: 'manual', y: geographic.elevation });
  assert.equal(geographicResult.success, true); close(geographicResult.asset!.position.x, -2, 1e-4); close(geographicResult.asset!.position.y, 16); close(geographicResult.asset!.position.z, 5, 1e-4);
  assert.equal(fixture.manager.validationCalls, 3);
});

test('preview does not mutate state and invalid/empty coordinate input has a code', () => {
  const fixture = placementFixture();
  const preview = fixture.placer.preview({ assetType: 'signal-tower', coordinateMode: 'local', first: 0, second: 0, yMode: 'auto' });
  assert.equal(preview.success, true); assert.equal(fixture.manager.placed.length, 0);
  const invalid = fixture.placer.preview({ assetType: 'signal-tower', coordinateMode: 'local', first: '', second: 0, yMode: 'auto' });
  assert.equal(invalid.success, false); assert.equal(invalid.code, 'INVALID_COORDINATE');
});

test('terrain switch reconfiguration replaces CRS/origin and local-only mode rejects GIS conversion', () => {
  const coordinates = service();
  const second: TerrainSpatialMetadata = { ...ASPEN, terrainId: 'second', projectedCRS: 'EPSG:32612', localOrigin: { easting: 500000, northing: 4500000, elevation: 1000 } };
  coordinates.configure(second);
  assert.deepEqual(coordinates.localToProjected({ x: 10, y: 20, z: 30 }), { easting: 500010, northing: 4499970, elevation: 1020 });
  coordinates.configureLocalOnly(second.localBounds);
  assert.equal(coordinates.hasProjectedCoordinates(), false);
  assert.throws(() => coordinates.localToProjected({ x: 0, y: 0, z: 0 }), (error: unknown) => error instanceof CoordinateServiceError && error.code === 'CRS_NOT_CONFIGURED');
});

function placementFixture(): { coordinates: CoordinateService; placer: CoordinateAssetPlacer; manager: StubManager } {
  const coordinates = service({ ...ASPEN, localBounds: { origin: { x: -10, y: 0, z: -10 }, width: 20, depth: 20, minHeight: 10, maxHeight: 10 } });
  const terrain: TerrainData = { terrainId: 'aspen_dem', width: 20, depth: 20, rows: 2, cols: 2, origin: { x: -10, y: 0, z: -10 }, heights: new Float32Array([10,10,10,10]), minHeight: 10, maxHeight: 10, waterRegions: [], semanticRegions: [], detectedMeshes: [], revision: 0 };
  const manager = new StubManager(); return { coordinates, manager, placer: new CoordinateAssetPlacer(coordinates, new TerrainHeightProvider(terrain), manager) };
}

class StubManager {
  placed: PlacedAsset[] = []; validationCalls = 0;
  validate(): PlacementValidation { this.validationCalls += 1; return { valid: true, height: 10, slope: 0 }; }
  placeAt(definitionId: string, position: { x: number; y: number; z: number }, rotationY = 0): PlacedAsset {
    const asset: PlacedAsset = { id: `asset-${this.placed.length}`, terrainId: 'aspen_dem', definitionId, position: { ...position }, rotationY, createdAt: 1 };
    this.placed.push(asset); return asset;
  }
}
