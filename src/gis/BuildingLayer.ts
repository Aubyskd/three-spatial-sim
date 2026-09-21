import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBuildingMaterial } from './BuildingMaterial';
import type { BuildingCollection, BuildingColliderBox, LocalBuildingFeature } from './VectorFeatureTypes';

export class BuildingLayer {
  readonly root = new THREE.Group();
  private readonly surface = new THREE.Group();
  private readonly footprintDebug = new THREE.Group();
  private readonly collisionDebug = new THREE.Group();
  private readonly heightSamples = new THREE.Group();
  private readonly boxes: BuildingColliderBox[];

  constructor(readonly collection: BuildingCollection) {
    this.root.name = 'osm-buildings';
    this.surface.name = 'osm-building-surfaces';
    this.footprintDebug.name = 'osm-building-footprints';
    this.collisionDebug.name = 'osm-building-collision-debug';
    this.heightSamples.name = 'osm-building-height-samples';
    this.root.add(this.surface, this.footprintDebug, this.collisionDebug, this.heightSamples);
    this.boxes = collection.features.map(buildingColliderBox);
    this.buildSurface();
    this.buildDebug();
    this.setCollisionDebugVisible(true);
    this.setHeightSamplesVisible(false);
  }

  setVisible(visible: boolean): void { this.surface.visible = visible; this.footprintDebug.visible = visible; }
  setCollisionDebugVisible(visible: boolean): void { this.collisionDebug.visible = visible; }
  setHeightSamplesVisible(visible: boolean): void { this.heightSamples.visible = visible; }
  getCollisionBoxes(): readonly BuildingColliderBox[] { return this.boxes; }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose();
    });
    this.root.removeFromParent();
  }

  private buildSurface(): void {
    const geometries: THREE.BufferGeometry[] = [];
    for (const feature of this.collection.features) {
      const shape = shapeFromFeature(feature);
      if (!shape) continue;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: feature.extrudeHeight, bevelEnabled: false, curveSegments: 1, steps: 1 });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, feature.baseHeight, 0);
      assertFinitePositions(geometry, `building ${feature.id}`);
      geometries.push(geometry);
    }
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error('Could not merge building geometry.');
    assertFinitePositions(merged, 'merged buildings');
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, createBuildingMaterial());
    mesh.name = 'osm-buildings-merged'; mesh.castShadow = true; mesh.receiveShadow = true;
    this.surface.add(mesh);
  }

  private buildDebug(): void {
    const footprintPositions: number[] = [];
    const samplePositions: number[] = [];
    for (const feature of this.collection.features) {
      feature.rings.forEach((ring, ringIndex) => {
        for (let index = 1; index < ring.length; index += 1) {
          footprintPositions.push(ring[index - 1][0], feature.baseHeight + 0.08, ring[index - 1][1],
            ring[index][0], feature.baseHeight + 0.08, ring[index][1]);
        }
        ring.forEach(([x, z], index) => samplePositions.push(x, feature.terrainHeights?.[ringIndex]?.[index] ?? feature.baseHeight, z));
      });
    }
    if (footprintPositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(footprintPositions, 3));
      this.footprintDebug.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xb58f82, transparent: true, opacity: 0.65 })));
    }
    if (samplePositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(samplePositions, 3));
      this.heightSamples.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x4f8b72, size: 1.2, sizeAttenuation: true })));
    }
    if (this.boxes.length) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ color: 0xc67878, wireframe: true, transparent: true, opacity: 0.28, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geometry, material, this.boxes.length);
      const matrix = new THREE.Matrix4();
      this.boxes.forEach((box, index) => {
        matrix.compose(new THREE.Vector3(box.center.x, box.center.y, box.center.z), new THREE.Quaternion(), new THREE.Vector3(box.size.x, box.size.y, box.size.z));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.collisionDebug.add(mesh);
    }
  }
}

function assertFinitePositions(geometry: THREE.BufferGeometry, label: string): void {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    if (![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite)) {
      throw new Error(`Non-finite position generated for ${label} at vertex ${index}.`);
    }
  }
}

function shapeFromFeature(feature: LocalBuildingFeature): THREE.Shape | null {
  const outer = feature.rings[0];
  if (!outer || outer.length < 4) return null;
  const shape = new THREE.Shape(outer.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of feature.rings.slice(1)) {
    if (hole.length >= 4) shape.holes.push(new THREE.Path(hole.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z))));
  }
  return shape;
}

function buildingColliderBox(feature: LocalBuildingFeature): BuildingColliderBox {
  const outer = feature.rings[0];
  const xs = outer.map((point) => point[0]); const zs = outer.map((point) => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  return {
    id: feature.id,
    center: { x: (minX + maxX) / 2, y: feature.baseHeight + feature.extrudeHeight / 2, z: (minZ + maxZ) / 2 },
    size: { x: Math.max(0.2, maxX - minX), y: feature.extrudeHeight, z: Math.max(0.2, maxZ - minZ) },
  };
}
