import * as THREE from 'three';
import { createRoadMaterial } from './RoadMaterial';
import type { RoadCollection } from './VectorFeatureTypes';

export class RoadLayer {
  readonly root = new THREE.Group();
  private readonly surface = new THREE.Group();
  private readonly widthDebug = new THREE.Group();
  private readonly heightSamples = new THREE.Group();

  constructor(readonly collection: RoadCollection) {
    this.root.name = 'osm-roads'; this.surface.name = 'osm-road-surfaces';
    this.widthDebug.name = 'osm-road-width-debug'; this.heightSamples.name = 'osm-road-height-samples';
    this.root.add(this.surface, this.widthDebug, this.heightSamples);
    this.build(); this.setWidthDebugVisible(false); this.setHeightSamplesVisible(false);
  }

  setVisible(visible: boolean): void { this.surface.visible = visible; }
  setWidthDebugVisible(visible: boolean): void { this.widthDebug.visible = visible; }
  setHeightSamplesVisible(visible: boolean): void { this.heightSamples.visible = visible; }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose();
    });
    this.root.removeFromParent();
  }

  private build(): void {
    const positions: number[] = []; const indices: number[] = []; const boundary: number[] = []; const samples: number[] = [];
    for (const road of this.collection.features) {
      const base = positions.length / 3;
      road.centerline.forEach((point, index) => {
        const previous = road.centerline[Math.max(0, index - 1)]; const next = road.centerline[Math.min(road.centerline.length - 1, index + 1)];
        const dx = next[0] - previous[0]; const dz = next[2] - previous[2]; const length = Math.max(1e-8, Math.hypot(dx, dz));
        const nx = (-dz / length) * road.width / 2; const nz = (dx / length) * road.width / 2;
        positions.push(point[0] + nx, point[1], point[2] + nz, point[0] - nx, point[1], point[2] - nz);
        samples.push(point[0], point[1] + 0.04, point[2]);
        if (index > 0) {
          const a = base + (index - 1) * 2; const b = base + index * 2;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
          const previousLeft = positions.slice((a) * 3, (a) * 3 + 3); const previousRight = positions.slice((a + 1) * 3, (a + 1) * 3 + 3);
          boundary.push(...previousLeft, point[0] + nx, point[1] + 0.04, point[2] + nz,
            ...previousRight, point[0] - nx, point[1] + 0.04, point[2] - nz);
        }
      });
    }
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      assertFinitePositions(geometry, 'merged roads');
      const mesh = new THREE.Mesh(geometry, createRoadMaterial()); mesh.name = 'osm-roads-ribbon'; mesh.receiveShadow = true;
      this.surface.add(mesh);
    }
    if (boundary.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(boundary, 3));
      this.widthDebug.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x718b92 })));
    }
    if (samples.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(samples, 3));
      this.heightSamples.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd58678, size: 1, sizeAttenuation: true })));
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
