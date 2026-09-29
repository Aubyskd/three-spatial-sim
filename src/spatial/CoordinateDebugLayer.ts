import * as THREE from 'three';
import type { LocalCoordinate, TerrainSpatialMetadata } from './CoordinateService';

export class CoordinateDebugLayer {
  readonly root = new THREE.Group();
  private readonly marker = new THREE.Group();
  private readonly origin = new THREE.Group();
  private readonly bounds = new THREE.Group();
  private readonly axes = new THREE.Group();
  private readonly grid = new THREE.Group();
  private hasMarker = false;
  private markerEnabled = true;

  constructor() {
    this.root.name = 'coordinate-debug';
    this.marker.name = 'coordinate-marker'; this.origin.name = 'local-origin-debug';
    this.bounds.name = 'terrain-bounds-debug'; this.axes.name = 'world-axes-debug'; this.grid.name = 'meter-grid-debug';
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 8, 32), new THREE.MeshBasicMaterial({ color: 0x4e9c7b, depthTest: false }));
    ring.rotation.x = Math.PI / 2;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4e9c7b, depthTest: false })); pin.position.y = 0.2;
    this.marker.add(ring, pin); this.marker.visible = false;
    this.root.add(this.marker, this.origin, this.bounds, this.axes, this.grid);
  }

  configure(bounds: TerrainSpatialMetadata['localBounds']): void {
    clearGroup(this.origin); clearGroup(this.bounds); clearGroup(this.axes); clearGroup(this.grid);
    const originMarker = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe2a5a5, depthTest: false }));
    this.origin.add(originMarker); this.origin.position.set(0, 0, 0);
    const points = [
      new THREE.Vector3(bounds.origin.x, bounds.minHeight + 0.15, bounds.origin.z),
      new THREE.Vector3(bounds.origin.x + bounds.width, bounds.minHeight + 0.15, bounds.origin.z),
      new THREE.Vector3(bounds.origin.x + bounds.width, bounds.minHeight + 0.15, bounds.origin.z + bounds.depth),
      new THREE.Vector3(bounds.origin.x, bounds.minHeight + 0.15, bounds.origin.z + bounds.depth),
    ];
    this.bounds.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xd28d94, depthTest: false })));
    const axis = new THREE.AxesHelper(Math.max(4, Math.min(50, Math.max(bounds.width, bounds.depth) * 0.04)));
    axis.setColors(0xdba9a8, 0xa7c9b2, 0xaebfda); this.axes.add(axis);
    const size = Math.max(100, Math.ceil(Math.max(bounds.width, bounds.depth) / 100) * 100);
    const helper = new THREE.GridHelper(size, Math.max(1, Math.round(size / 100)), 0xb9c8c5, 0xdfe7e5);
    helper.position.set(bounds.origin.x + bounds.width / 2, bounds.minHeight + 0.04, bounds.origin.z + bounds.depth / 2); this.grid.add(helper);
    this.origin.visible = false; this.bounds.visible = false; this.axes.visible = false; this.grid.visible = false;
    this.hasMarker = false; this.marker.visible = false;
  }

  setMarker(position: LocalCoordinate | null): void { this.hasMarker = Boolean(position); this.marker.visible = this.markerEnabled && this.hasMarker; if (position) this.marker.position.set(position.x, position.y + 0.12, position.z); }
  setMarkerVisible(visible: boolean): void { this.markerEnabled = visible; this.marker.visible = visible && this.hasMarker; }
  setOriginVisible(visible: boolean): void { this.origin.visible = visible; }
  setBoundsVisible(visible: boolean): void { this.bounds.visible = visible; }
  setAxesVisible(visible: boolean): void { this.axes.visible = visible; }
  setGridVisible(visible: boolean): void { this.grid.visible = visible; }
  dispose(): void { clearGroup(this.root); this.root.removeFromParent(); }
}

function clearGroup(group: THREE.Object3D): void {
  group.traverse((object) => {
    if (object === group) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineLoop) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose();
    }
  });
  group.clear();
}
