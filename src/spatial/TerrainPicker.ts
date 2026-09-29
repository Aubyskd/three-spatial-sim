import * as THREE from 'three';
import type { LocalCoordinate } from './CoordinateService';

export class TerrainPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private terrain?: THREE.Object3D;

  constructor(private readonly camera: THREE.Camera, private readonly element: HTMLElement) {}

  setActiveTerrain(terrain?: THREE.Object3D): void { this.terrain = terrain; }

  pickTerrain(clientX: number, clientY: number): LocalCoordinate | null {
    if (!this.terrain || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld(); this.terrain.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = this.raycaster.intersectObject(this.terrain, false)[0]?.point;
    return point ? { x: point.x, y: point.y, z: point.z } : null;
  }
}
