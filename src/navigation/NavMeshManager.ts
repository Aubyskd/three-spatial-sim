import * as THREE from 'three';
import { NavMeshQuery, init, type NavMesh } from 'recast-navigation';
import { threeToSoloNavMesh } from '@recast-navigation/three';
import type { SemanticMap } from '../semantic/SemanticMap';
import type { Vector3Data } from '../types';

export interface NavigationCell {
  x: number;
  y?: number;
  z: number;
  size: number;
}

export class NavMeshManager {
  readonly cellSize = 1;
  private readonly halfExtent = 30;
  private cells = new Map<string, NavigationCell>();
  private navMesh?: NavMesh;
  private query?: NavMeshQuery;
  private recastReady = false;
  lastError?: string;

  constructor(private readonly semantics: SemanticMap) {}

  async initialize(): Promise<void> {
    this.rebuildGrid();
    try {
      await init();
      this.rebuildRecast();
      this.recastReady = true;
    } catch (error) {
      this.recastReady = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('Recast initialization failed; grid A* fallback remains active.', error);
    }
  }

  async rebuild(): Promise<void> {
    this.rebuildGrid();
    if (!this.recastReady) return;
    try {
      this.rebuildRecast();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error('Recast navmesh rebuild failed; grid A* fallback remains active.', error);
    }
  }

  getCells(): NavigationCell[] {
    return [...this.cells.values()];
  }

  isWalkable(x: number, z: number): boolean {
    return this.cells.has(this.keyFromPosition(x, z));
  }

  getCell(x: number, z: number): NavigationCell | undefined {
    return this.cells.get(this.keyFromPosition(x, z));
  }

  neighbors(cell: NavigationCell): NavigationCell[] {
    const result: NavigationCell[] = [];
    const offsets = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1],
    ];
    for (const [dx, dz] of offsets) {
      const next = this.cells.get(this.key(cell.x + dx * this.cellSize, cell.z + dz * this.cellSize));
      if (!next) continue;
      if (dx !== 0 && dz !== 0) {
        if (!this.cells.has(this.key(cell.x + dx, cell.z)) || !this.cells.has(this.key(cell.x, cell.z + dz))) continue;
      }
      result.push(next);
    }
    return result;
  }

  computeRecastPath(start: Vector3Data, end: Vector3Data): Vector3Data[] | null {
    if (!this.query) return null;
    const result = this.query.computePath(start, end, { halfExtents: { x: 2, y: 4, z: 2 } });
    if (!result.success || result.path.length === 0) return null;
    return result.path.map((point) => ({ x: point.x, y: 0.9, z: point.z }));
  }

  private rebuildGrid(): void {
    this.cells.clear();
    const clearance = 0.55;
    for (let x = -this.halfExtent + 0.5; x < this.halfExtent; x += this.cellSize) {
      for (let z = -this.halfExtent + 0.5; z < this.halfExtent; z += this.cellSize) {
        const probes = [
          [x, z], [x - clearance, z], [x + clearance, z], [x, z - clearance], [x, z + clearance],
        ];
        if (probes.every(([px, pz]) => Number.isFinite(this.semantics.movementCostAt(px, pz)))) {
          const cell = { x, z, size: this.cellSize };
          this.cells.set(this.key(x, z), cell);
        }
      }
    }
  }

  private rebuildRecast(): void {
    this.query?.destroy();
    this.navMesh?.destroy();
    const mesh = this.buildWalkableGeometry();
    const result = threeToSoloNavMesh([mesh], {
      cs: 0.3,
      ch: 0.2,
      walkableSlopeAngle: 45,
      walkableHeight: 1.6,
      walkableClimb: 0.3,
      walkableRadius: 0.35,
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      minRegionArea: 3,
      mergeRegionArea: 8,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    });
    mesh.geometry.dispose();
    if (!result.success) throw new Error(result.error);
    this.navMesh = result.navMesh;
    this.query = new NavMeshQuery(result.navMesh);
  }

  private buildWalkableGeometry(): THREE.Mesh {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const cell of this.cells.values()) {
      const index = vertices.length / 3;
      const half = cell.size / 2;
      vertices.push(
        cell.x - half, 0, cell.z - half,
        cell.x + half, 0, cell.z - half,
        cell.x + half, 0, cell.z + half,
        cell.x - half, 0, cell.z + half,
      );
      indices.push(index, index + 3, index + 2, index, index + 2, index + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  }

  private keyFromPosition(x: number, z: number): string {
    const cellX = Math.floor(x / this.cellSize) * this.cellSize + this.cellSize / 2;
    const cellZ = Math.floor(z / this.cellSize) * this.cellSize + this.cellSize / 2;
    return this.key(cellX, cellZ);
  }

  key(x: number, z: number): string {
    return `${x.toFixed(2)},${z.toFixed(2)}`;
  }
}
