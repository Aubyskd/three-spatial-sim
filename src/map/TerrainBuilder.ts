import * as THREE from 'three';
import { COLORS } from '../config/constants';
import type { TerrainData } from './MapTypes';

export class TerrainBuilder {
  async build(data: TerrainData): Promise<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>> {
    let geometry: THREE.PlaneGeometry;
    if (data.type === 'heightmap' && data.source) {
      try {
        geometry = await this.loadHeightmap(data.source, data.width, data.depth, data.heightScale);
      } catch (error) {
        console.warn('Heightmap load failed; using procedural terrain fallback.', error);
        geometry = this.createProcedural(data.width, data.depth, data.heightScale);
      }
    } else {
      geometry = this.createProcedural(data.width, data.depth, data.heightScale);
    }

    const material = new THREE.MeshStandardMaterial({
      color: COLORS.ground,
      roughness: 0.92,
      metalness: 0.04,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'terrain';
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  async loadHeightmap(url: string, width: number, depth: number, heightScale: number): Promise<THREE.PlaneGeometry> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Unable to load heightmap: ${url}`));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const geometry = new THREE.PlaneGeometry(width, depth, canvas.width - 1, canvas.height - 1);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const luminance = pixels[i * 4] / 255;
      positions.setZ(i, (luminance - 0.5) * heightScale);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  private createProcedural(width: number, depth: number, heightScale: number): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(width, depth, 48, 48);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      positions.setZ(i, Math.sin(x * 0.14) * Math.cos(y * 0.11) * heightScale * 0.22);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
}
