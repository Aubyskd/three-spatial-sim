import * as THREE from 'three';
import type { TerrainData } from '../terrain/TerrainTypes';
import { getInferredWaterThreshold } from '../terrain/TerrainDataUtils';

/** Lightweight animated water used for explicit water regions and inferred lowland channels. */
export class DynamicWaterSystem {
  readonly group = new THREE.Group();
  readonly inferred: boolean;
  readonly waterLevel: number;
  private readonly material: THREE.ShaderMaterial;

  constructor(data: TerrainData) {
    this.group.name = 'dynamic-water';
    const percentile = getInferredWaterThreshold(data);
    const heightRange = Math.max(0.1, data.maxHeight - data.minHeight);
    this.waterLevel = percentile + 0.015;
    this.inferred = data.source?.type === 'glb' ? data.source.waterMode === 'inferred'
      : data.waterRegions.length === 0 && data.source?.type !== 'gis-dem';
    this.material = this.createMaterial(Math.min(0.12, Math.max(0.025, heightRange * 0.007)));
    this.refresh(data);
  }

  refresh(data: TerrainData): void {
    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
      child.removeFromParent();
    }
    if (data.waterGrid) {
      const explicit = this.buildExplicitGeometry(data);
      if (explicit.getAttribute('position').count > 0) this.addSurface(explicit);
      else explicit.dispose();
    } else if (data.waterRegions.length > 0) {
      for (const region of data.waterRegions) {
        if (region.shape.kind !== 'rectangle') continue;
        const halfWidth = region.shape.width / 2;
        const halfDepth = region.shape.depth / 2;
        const { x, z } = region.shape.center;
        this.addSurface(this.quadGeometry(x - halfWidth, x + halfWidth, z - halfDepth, z + halfDepth, this.waterLevel));
      }
    } else if (this.inferred) {
      const inferred = this.buildLowlandGeometry(data, getInferredWaterThreshold(data));
      if (inferred.getAttribute('position').count > 0) this.addSurface(inferred);
      else inferred.dispose();
    }
  }

  update(elapsedSeconds: number): void {
    this.material.uniforms.uTime.value = elapsedSeconds;
  }

  dispose(): void {
    this.group.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    this.material.dispose();
    this.group.removeFromParent();
  }

  private addSurface(geometry: THREE.BufferGeometry): void {
    const surface = new THREE.Mesh(geometry, this.material);
    surface.name = this.inferred ? 'inferred-river-surface' : 'water-surface';
    surface.renderOrder = 3;
    surface.frustumCulled = false;
    this.group.add(surface);
  }

  private buildExplicitGeometry(data: TerrainData): THREE.BufferGeometry {
    const grid = data.waterGrid!;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row < grid.rows; row += 1) for (let col = 0; col < grid.cols; col += 1) {
      const cell = row * grid.cols + col;
      if (grid.mask[cell] !== 1) continue;
      const x0 = data.origin.x + col / grid.cols * data.width;
      const x1 = data.origin.x + (col + 1) / grid.cols * data.width;
      const z0 = data.origin.z + row / grid.rows * data.depth;
      const z1 = data.origin.z + (row + 1) / grid.rows * data.depth;
      const y = grid.heights[cell] + 0.03;
      const index = positions.length / 3;
      positions.push(x0,y,z0, x0,y,z1, x1,y,z1, x1,y,z0);
      indices.push(index,index+1,index+2,index,index+2,index+3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildLowlandGeometry(data: TerrainData, threshold: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const cellWidth = data.width / (data.cols - 1);
    const cellDepth = data.depth / (data.rows - 1);
    type Vertex = { x: number; z: number; height: number };
    const appendClipped = (triangle: Vertex[]): void => {
      const clipped: Vertex[] = [];
      for (let index = 0; index < triangle.length; index += 1) {
        const current = triangle[index]; const next = triangle[(index + 1) % triangle.length];
        const currentWet = current.height <= threshold; const nextWet = next.height <= threshold;
        if (currentWet) clipped.push(current);
        if (currentWet !== nextWet) {
          const t = (threshold - current.height) / (next.height - current.height);
          clipped.push({ x: current.x + (next.x - current.x) * t, z: current.z + (next.z - current.z) * t, height: threshold });
        }
      }
      if (clipped.length < 3) return;
      const base = positions.length / 3;
      for (const vertex of clipped) positions.push(vertex.x, this.waterLevel, vertex.z);
      for (let index = 1; index < clipped.length - 1; index += 1) indices.push(base, base + index, base + index + 1);
    };
    for (let row = 0; row < data.rows - 1; row += 1) {
      for (let col = 0; col < data.cols - 1; col += 1) {
        if (data.sampleCoverage) {
          const covered = data.sampleCoverage[row * data.cols + col]
            + data.sampleCoverage[row * data.cols + col + 1]
            + data.sampleCoverage[(row + 1) * data.cols + col]
            + data.sampleCoverage[(row + 1) * data.cols + col + 1];
          if (covered < 4) continue;
        }
        const x0 = data.origin.x + col * cellWidth;
        const x1 = x0 + cellWidth;
        const z0 = data.origin.z + row * cellDepth;
        const z1 = z0 + cellDepth;
        const a = { x: x0, z: z0, height: data.heights[row * data.cols + col] };
        const b = { x: x1, z: z0, height: data.heights[row * data.cols + col + 1] };
        const c = { x: x0, z: z1, height: data.heights[(row + 1) * data.cols + col] };
        const d = { x: x1, z: z1, height: data.heights[(row + 1) * data.cols + col + 1] };
        appendClipped([a, c, d]); appendClipped([a, d, b]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private quadGeometry(minX: number, maxX: number, minZ: number, maxZ: number, y: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([minX,y,minZ, maxX,y,minZ, maxX,y,maxZ, minX,y,maxZ], 3));
    geometry.setIndex([0,2,1,0,3,2]);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createMaterial(waveHeight: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaveHeight: { value: waveHeight },
        uDeepColor: { value: new THREE.Color(0x8dbbcf) },
        uShallowColor: { value: new THREE.Color(0xb9dce3) },
        uFoamColor: { value: new THREE.Color(0xf4faf8) },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWaveHeight;
        varying vec3 vWorldPosition;
        varying float vWave;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          float waveA = sin(world.x * 0.62 + uTime * 1.35);
          float waveB = sin(world.z * 0.83 - uTime * 1.08);
          float waveC = sin((world.x + world.z) * 1.55 + uTime * 0.72);
          vWave = waveA * 0.5 + waveB * 0.32 + waveC * 0.18;
          world.y += vWave * uWaveHeight;
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        varying vec3 vWorldPosition;
        varying float vWave;
        void main() {
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(viewDirection, vec3(0.0, 1.0, 0.0)), 0.0), 2.2);
          float flow = 0.5 + 0.5 * sin(vWorldPosition.x * 0.38 + vWorldPosition.z * 0.22 + uTime * 1.1);
          float rippleA = sin(vWorldPosition.x * 1.25 + vWorldPosition.z * 0.42 - uTime * 1.55);
          float rippleB = sin(vWorldPosition.x * 0.48 - vWorldPosition.z * 1.62 + uTime * 0.92);
          float ripple = 0.5 + rippleA * 0.25 + rippleB * 0.25;
          float highlight = smoothstep(0.86, 1.0, ripple) * (0.08 + fresnel * 0.12);
          vec3 color = mix(uDeepColor, uShallowColor, 0.32 + fresnel * 0.48 + flow * 0.14);
          color = mix(color, uFoamColor, highlight + max(vWave - 0.72, 0.0) * 0.12);
          gl_FragColor = vec4(color, 0.72 + fresnel * 0.16);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
  }
}
