import * as THREE from 'three';
import type { PhysicalPointResult, PhysicalPointSurfaceType } from './PhysicalPointTypes';

interface PickSurface { root: THREE.Object3D; type: Exclude<PhysicalPointSurfaceType, 'none'>; }

export class PhysicalPointPicker {
  private terrain?: THREE.Object3D;
  private buildings: THREE.Object3D[] = [];
  private roads: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(private readonly camera: THREE.Camera, private readonly domElement: HTMLElement) {}

  configure(terrain?: THREE.Object3D, buildings: readonly THREE.Object3D[] = [], roads: readonly THREE.Object3D[] = []): void {
    this.terrain = terrain; this.buildings = [...buildings]; this.roads = [...roads];
  }

  clear(): void { this.configure(); }

  pick(clientX: number, clientY: number): PhysicalPointResult {
    const bounds = this.domElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return invalid('none', 'NO_TERRAIN_SUPPORT');
    this.pointer.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.pickRay(this.raycaster.ray.origin, this.raycaster.ray.direction);
  }

  /** Public for deterministic physical-selection regression tests. */
  pickRay(origin: THREE.Vector3, direction: THREE.Vector3): PhysicalPointResult {
    if (!this.terrain) return invalid('none', 'NO_TERRAIN_SUPPORT');
    this.raycaster.set(origin, direction.clone().normalize()); this.raycaster.near = 0; this.raycaster.far = Infinity;
    const surfaces: PickSurface[] = [
      { root: this.terrain, type: 'terrain' },
      ...this.buildings.map((root): PickSurface => ({ root, type: 'building' })),
      ...this.roads.map((root): PickSurface => ({ root, type: 'road' })),
    ];
    surfaces.forEach(({ root }) => root.updateWorldMatrix(true, true));
    const hits = surfaces.flatMap(({ root, type }) => this.raycaster.intersectObject(root, true).map((hit) => ({ hit, type }))).sort((a, b) => a.hit.distance - b.hit.distance);
    const nearest = hits[0];
    if (!nearest) return invalid('none', 'NO_TERRAIN_SUPPORT');
    if (nearest.type === 'building') return invalid('building', 'BUILDING_SURFACE');
    const terrainHit = hits.find((candidate) => candidate.type === 'terrain');
    if (!terrainHit) return invalid(nearest.type, 'NO_TERRAIN_SUPPORT');
    return { valid: true, surfaceType: nearest.type, groundPosition: vectorData(terrainHit.hit.point) };
  }
}

function invalid(surfaceType: PhysicalPointSurfaceType, reason: PhysicalPointResult['reason']): PhysicalPointResult { return { valid: false, surfaceType, reason }; }
function vectorData(point: THREE.Vector3): { x: number; y: number; z: number } { return { x: point.x, y: point.y, z: point.z }; }
