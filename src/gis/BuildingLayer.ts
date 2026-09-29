import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBuildingMaterial } from './BuildingMaterial';
import type { BuildingCollection, BuildingColliderMesh, LocalBuildingFeature } from './VectorFeatureTypes';

export class BuildingLayer {
  readonly root = new THREE.Group();
  private readonly surface = new THREE.Group();
  private readonly collisionDebug = new THREE.Group();
  private readonly heightSamples = new THREE.Group();
  private collisionMesh?: BuildingColliderMesh;

  constructor(readonly collection: BuildingCollection) {
    this.root.name = 'osm-buildings';
    this.surface.name = 'osm-building-surfaces';
    this.collisionDebug.name = 'osm-building-collision-debug';
    this.heightSamples.name = 'osm-building-height-samples';
    this.root.add(this.surface, this.collisionDebug, this.heightSamples);
    this.buildSurface();
    this.buildDebug();
    this.setCollisionDebugVisible(false);
    this.setHeightSamplesVisible(false);
  }

  setVisible(visible: boolean): void { this.surface.visible = visible; }
  setCollisionDebugVisible(visible: boolean): void { this.collisionDebug.visible = visible; }
  setHeightSamplesVisible(visible: boolean): void { this.heightSamples.visible = visible; }
  getCollisionMesh(): BuildingColliderMesh | undefined { return this.collisionMesh; }
  /** Exact rendered building geometry; the visibility analyzer must not raycast the whole scene. */
  getVisibilityOccluders(): THREE.Object3D[] { return [...this.surface.children]; }
  getPhysicalSurfaces(): THREE.Object3D[] { return [...this.surface.children]; }

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
    this.collisionMesh = collisionMeshFromGeometry(merged);
    const collisionView = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({
      color: 0xc67878, wireframe: true, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    collisionView.name = 'osm-building-collision-mesh';
    collisionView.renderOrder = 4;
    this.collisionDebug.add(collisionView);
  }

  private buildDebug(): void {
    const samplePositions: number[] = [];
    for (const feature of this.collection.features) {
      feature.rings.forEach((ring, ringIndex) => {
        ring.forEach(([x, z], index) => samplePositions.push(x, feature.terrainHeights?.[ringIndex]?.[index] ?? feature.baseHeight, z));
      });
    }
    if (samplePositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(samplePositions, 3));
      this.heightSamples.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x4f8b72, size: 1.2, sizeAttenuation: true })));
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

function collisionMeshFromGeometry(geometry: THREE.BufferGeometry): BuildingColliderMesh {
  const position = geometry.getAttribute('position');
  const vertices = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    vertices[index * 3] = position.getX(index);
    vertices[index * 3 + 1] = position.getY(index);
    vertices[index * 3 + 2] = position.getZ(index);
  }
  const sourceIndex = geometry.getIndex();
  const indices = sourceIndex
    ? Uint32Array.from(sourceIndex.array)
    : Uint32Array.from({ length: position.count }, (_, index) => index);
  if (indices.length % 3 !== 0) throw new Error('Building collider geometry does not contain complete triangles.');
  return { vertices, indices };
}
