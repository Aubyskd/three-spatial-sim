import * as THREE from 'three';
import { DynamicWaterSystem } from '../render/DynamicWaterSystem';
import type { TerrainData } from './TerrainTypes';

export interface TerrainVisual {
  root: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  water: DynamicWaterSystem;
}

export class TerrainVisualBuilder {
  build(data: TerrainData): TerrainVisual {
    const geometry = new THREE.PlaneGeometry(data.width, data.depth, data.cols - 1, data.rows - 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide }));
    mesh.name = `terrain-${data.terrainId}`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(data.origin.x + data.width / 2, 0, data.origin.z + data.depth / 2);
    mesh.receiveShadow = true;
    this.updateGeometry(mesh, data);
    const water = new DynamicWaterSystem(data);
    const root = new THREE.Group(); root.name = `terrain-runtime-${data.terrainId}`; root.add(mesh, water.group);
    return { root, mesh, water };
  }

  updateGeometry(mesh: THREE.Mesh<THREE.PlaneGeometry>, data: TerrainData): void {
    const positions = mesh.geometry.attributes.position;
    for (let row = 0; row < data.rows; row += 1) for (let col = 0; col < data.cols; col += 1) positions.setZ(row * data.cols + col, data.heights[row * data.cols + col]);
    const colors: number[] = [];
    const low = new THREE.Color(0xa9cfc2); const middle = new THREE.Color(0xc7dcc0); const high = new THREE.Color(0xe6d5c4); const range = Math.max(0.001, data.maxHeight - data.minHeight);
    for (let index = 0; index < data.heights.length; index += 1) {
      const normalized = THREE.MathUtils.clamp((data.heights[index] - data.minHeight) / range, 0, 1);
      const color = normalized < 0.58 ? low.clone().lerp(middle, normalized / 0.58) : middle.clone().lerp(high, (normalized - 0.58) / 0.42);
      colors.push(color.r, color.g, color.b);
    }
    mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }

  dispose(visual: TerrainVisual): void {
    visual.water.dispose();
    visual.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material.dispose();
    });
    visual.root.removeFromParent();
  }
}
