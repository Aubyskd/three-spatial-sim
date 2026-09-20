import * as THREE from 'three';
import { NavMeshQuery, init, type NavMesh } from 'recast-navigation';
import { threeToSoloNavMesh } from '@recast-navigation/three';
import type { SemanticMap } from '../semantic/SemanticMap';
import { getTerrainSlope, hasTerrainSupport, isExplicitWater, isInferredWater, sampleTerrainHeight } from '../terrain/TerrainDataUtils';
import type { TerrainData } from '../terrain/TerrainTypes';
import type { Vector3Data } from '../types';
import type { NavigationCell } from './NavMeshManager';

export class TerrainNavMeshManager {
  readonly cellSize: number;
  readonly terrainId: string;
  builtForTerrainRevision = -1;
  lastError?: string;
  private cells = new Map<string, NavigationCell>();
  private navMesh?: NavMesh;
  private query?: NavMeshQuery;
  private recastReady = false;

  constructor(private readonly semantics: SemanticMap, private readonly terrain: TerrainData) {
    this.terrainId = terrain.terrainId;
    this.cellSize = Math.max(0.75, Math.max(terrain.width, terrain.depth) / 80);
  }

  async initialize(): Promise<void> {
    this.rebuildGrid();
    try { await init(); this.rebuildRecast(); this.recastReady = true; }
    catch (error) { this.lastError = error instanceof Error ? error.message : String(error); console.error('Recast initialization failed; grid A* fallback remains active.', error); }
  }

  async rebuild(): Promise<void> {
    this.rebuildGrid();
    if (!this.recastReady) return;
    try { this.rebuildRecast(); this.lastError = undefined; }
    catch (error) { this.lastError = error instanceof Error ? error.message : String(error); console.error('Recast navmesh rebuild failed; grid A* fallback remains active.', error); }
  }

  getCells(): NavigationCell[] { return [...this.cells.values()]; }
  isWalkable(x: number, z: number): boolean { return this.cells.has(this.keyFromPosition(x, z)); }
  getCell(x: number, z: number): NavigationCell | undefined { return this.cells.get(this.keyFromPosition(x, z)); }
  key(x: number, z: number): string { return `${x.toFixed(3)},${z.toFixed(3)}`; }

  neighbors(cell: NavigationCell): NavigationCell[] {
    const result: NavigationCell[] = [];
    for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const next = this.cells.get(this.key(cell.x + dx * this.cellSize, cell.z + dz * this.cellSize));
      if (!next) continue;
      if (dx !== 0 && dz !== 0 && (!this.cells.has(this.key(cell.x + dx * this.cellSize, cell.z)) || !this.cells.has(this.key(cell.x, cell.z + dz * this.cellSize)))) continue;
      result.push(next);
    }
    return result;
  }

  computeRecastPath(start: Vector3Data, end: Vector3Data): Vector3Data[] | null {
    if (!this.query || this.builtForTerrainRevision !== this.terrain.revision) return null;
    const result = this.query.computePath(start, end, { halfExtents: { x: this.cellSize * 2, y: Math.max(8, this.terrain.maxHeight - this.terrain.minHeight + 2), z: this.cellSize * 2 } });
    return result.success && result.path.length ? result.path.map((point) => ({ x: point.x, y: point.y + 0.9, z: point.z })) : null;
  }

  dispose(): void { this.query?.destroy(); this.navMesh?.destroy(); this.cells.clear(); }

  private rebuildGrid(): void {
    this.cells.clear();
    const minX = this.terrain.origin.x + this.cellSize / 2; const maxX = this.terrain.origin.x + this.terrain.width;
    const minZ = this.terrain.origin.z + this.cellSize / 2; const maxZ = this.terrain.origin.z + this.terrain.depth;
    for (let x = minX; x < maxX; x += this.cellSize) for (let z = minZ; z < maxZ; z += this.cellSize) {
      if (hasTerrainSupport(this.terrain, x, z) && !isExplicitWater(this.terrain, x, z) && !isInferredWater(this.terrain, x, z) && Number.isFinite(this.semantics.movementCostAt(x, z)) && getTerrainSlope(this.terrain, x, z) <= 42) this.cells.set(this.key(x, z), { x, y: sampleTerrainHeight(this.terrain, x, z), z, size: this.cellSize });
    }
  }

  private rebuildRecast(): void {
    this.query?.destroy(); this.navMesh?.destroy();
    const mesh = this.buildWalkableGeometry();
    const result = threeToSoloNavMesh([mesh], { cs: Math.max(0.25, this.cellSize / 3), ch: 0.2, walkableSlopeAngle: 45, walkableHeight: 1.6, walkableClimb: Math.min(2, Math.max(0.5, this.cellSize * 0.11)), walkableRadius: 0.4, maxEdgeLen: 12, maxSimplificationError: 1.3, minRegionArea: 3, mergeRegionArea: 8, maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1 });
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    if (!result.success) throw new Error(result.error);
    this.navMesh = result.navMesh; this.query = new NavMeshQuery(result.navMesh); this.builtForTerrainRevision = this.terrain.revision;
  }

  private buildWalkableGeometry(): THREE.Mesh {
    const vertices: number[] = []; const indices: number[] = [];
    const { rows, cols, origin, width, depth, heights } = this.terrain;
    const dx = width / (cols - 1); const dz = depth / (rows - 1);
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
      vertices.push(origin.x + col * dx, heights[row * cols + col], origin.z + row * dz);
    }
    // Keep the source grid continuous for Recast. Clipping individual DEM quads
    // around mask edges can leave Recast with zero polygons; the navigation grid
    // and Pathfinder still reject unsupported or restricted path segments.
    for (let row = 0; row < rows - 1; row += 1) for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col; const b = a + 1; const c = a + cols; const d = c + 1;
      indices.push(a,c,d,a,d,b);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  }

  private keyFromPosition(x: number, z: number): string {
    const cx = this.terrain.origin.x + (Math.floor((x - this.terrain.origin.x) / this.cellSize) + 0.5) * this.cellSize;
    const cz = this.terrain.origin.z + (Math.floor((z - this.terrain.origin.z) / this.cellSize) + 0.5) * this.cellSize;
    return this.key(cx, cz);
  }
}
