import * as THREE from 'three';
import { COLORS } from '../config/constants';
import type { SemanticType } from '../map/MapTypes';
import type { SemanticMap } from '../semantic/SemanticMap';
import type { Vector3Data } from '../types';
import type { PlacedAsset, TerrainData } from '../terrain/TerrainTypes';
import { hasTerrainSupport, isExplicitWater, isInferredWater, sampleTerrainHeight } from '../terrain/TerrainDataUtils';
import { ALGORITHM_DEFAULTS } from '../algorithm/EnvironmentConfig';
import { buildTerrainRegionOverlay, regionOutline, sampleVisualHeight, terrainLinePoints } from './TerrainRegionOverlay';

const colorForRegion: Record<SemanticType, number> = {
  road: COLORS.road,
  grass: COLORS.grass,
  water: COLORS.water,
  obstacle: COLORS.obstacle,
  restricted: COLORS.restricted,
};

export class DebugRenderer {
  private readonly semanticGroup = new THREE.Group();
  private readonly regionDraftGroup = new THREE.Group();
  private readonly draftMarkerGeometry = new THREE.SphereGeometry(0.16, 8, 6);
  private readonly draftMarkerMaterial = new THREE.MeshBasicMaterial({ color: COLORS.restricted, depthTest: false });
  private readonly navGroup = new THREE.Group();
  private readonly physicsGroup = new THREE.Group();
  private readonly coverageGroup = new THREE.Group();
  private pathLine?: THREE.Line;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly semantics: SemanticMap,
    private readonly terrain?: TerrainData,
  ) {
    this.semanticGroup.name = 'semantic-debug';
    this.regionDraftGroup.name = 'region-draft';
    this.navGroup.name = 'nav-debug';
    this.physicsGroup.name = 'physics-debug';
    this.coverageGroup.name = 'coverage-debug';
    scene.add(this.semanticGroup, this.regionDraftGroup, this.navGroup, this.physicsGroup, this.coverageGroup);
    this.rebuildSemantic();
  }

  rebuildSemantic(): void {
    this.clearGroup(this.semanticGroup);
    const regions = [...this.semantics.autoRegions, ...this.semantics.manual.all()];
    for (const region of regions) {
      // OSM buildings and roads have dedicated merged runtime layers. Rebuilding
      // thousands of terrain-clipped semantic meshes here would duplicate them
      // and make Aspen initialization unnecessarily expensive.
      if (region.id.startsWith('osm-building-') || region.id.startsWith('osm-road-')) continue;
      if (this.terrain) {
        const explicitMeshWater = region.type === 'water' && this.terrain.waterGrid
          && this.terrain.waterRegions.some((water) => water.id === region.id);
        const geometry = buildTerrainRegionOverlay(region.shape, this.terrain, 0.08,
          explicitMeshWater ? (x, z) => isExplicitWater(this.terrain!, x, z) : undefined);
        if (geometry.getAttribute('position').count === 0) { geometry.dispose(); continue; }
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          color: colorForRegion[region.type], transparent: true, opacity: region.type === 'restricted' ? 0.42 : 0.24,
          depthWrite: false, side: THREE.DoubleSide,
        }));
        mesh.renderOrder = 2;
        this.semanticGroup.add(mesh);
        if (region.type === 'restricted') {
          const outline = terrainLinePoints(this.terrain, regionOutline(region.shape), true);
          if (outline.length > 1) {
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineBasicMaterial({ color: colorForRegion.restricted }));
            line.renderOrder = 3;
            this.semanticGroup.add(line);
          }
        }
        continue;
      }
      let geometry: THREE.BufferGeometry;
      if (region.shape.kind === 'rectangle') {
        geometry = new THREE.PlaneGeometry(region.shape.width, region.shape.depth);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: colorForRegion[region.type], transparent: true, opacity: 0.24, depthWrite: false }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(region.shape.center.x, 0.07, region.shape.center.z);
        this.semanticGroup.add(mesh);
      } else {
        const shape = new THREE.Shape(region.shape.points.map((point) => new THREE.Vector2(point.x, point.z)));
        geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: colorForRegion[region.type], transparent: true, opacity: 0.24, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.07;
        this.semanticGroup.add(mesh);
      }
    }
  }

  setRegionDraft(points: readonly { x: number; z: number }[], cursor?: { x: number; z: number }): void {
    this.clearGroup(this.regionDraftGroup);
    if (!this.terrain) return;
    const current = cursor ? [...points, cursor] : [...points];
    if (current.length > 1) {
      const line = terrainLinePoints(this.terrain, current);
      if (line.length > 1) this.regionDraftGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: COLORS.restricted, depthTest: false }),
      ));
    }
    if (current.length >= 3) {
      const closing = terrainLinePoints(this.terrain, [current[current.length - 1], current[0]]);
      if (closing.length > 1) this.regionDraftGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(closing), new THREE.LineBasicMaterial({ color: COLORS.restricted, transparent: true, opacity: 0.45, depthTest: false }),
      ));
    }
    const markers = new THREE.InstancedMesh(this.draftMarkerGeometry, this.draftMarkerMaterial, points.length);
    const matrix = new THREE.Matrix4();
    let markerCount = 0;
    for (const point of points) {
      const y = sampleVisualHeight(this.terrain, point.x, point.z);
      if (!Number.isFinite(y)) continue;
      markers.setMatrixAt(markerCount++, matrix.makeTranslation(point.x, y + 0.18, point.z));
    }
    markers.count = markerCount;
    if (markerCount) this.regionDraftGroup.add(markers);
  }

  clearRegionDraft(): void { this.clearGroup(this.regionDraftGroup); }

  setSemanticVisible(visible: boolean): void {
    this.semanticGroup.visible = visible;
  }

  setNavVisible(visible: boolean): void {
    this.navGroup.visible = visible;
  }

  setPhysicsVisible(visible: boolean): void {
    this.physicsGroup.visible = visible;
  }

  drawCoverage(terrain: TerrainData, towers: readonly PlacedAsset[], semanticAt: (x: number, z: number) => { type: string; walkable: boolean } | undefined): void {
    this.clearGroup(this.coverageGroup);
    const resolution = 32;
    const points: Array<{ x: number; y: number; z: number; count: number }> = [];
    for (let row = 0; row < resolution; row += 1) for (let col = 0; col < resolution; col += 1) {
      const x = terrain.origin.x + ((col + 0.5) / resolution) * terrain.width;
      const z = terrain.origin.z + ((row + 0.5) / resolution) * terrain.depth;
      const semantic = semanticAt(x, z);
      if (!hasTerrainSupport(terrain, x, z) || isInferredWater(terrain, x, z) || (semantic && !semantic.walkable)) continue;
      const count = towers.reduce((total, tower) => total + (Math.hypot(tower.position.x - x, tower.position.z - z) <= ALGORITHM_DEFAULTS.coverageRadius ? 1 : 0), 0);
      points.push({ x, y: sampleTerrainHeight(terrain, x, z) + 0.16, z, count });
    }
    const geometry = new THREE.BoxGeometry(Math.max(0.12, terrain.width / resolution * 0.22), 0.035, Math.max(0.12, terrain.depth / resolution * 0.22));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, points.length);
    const matrix = new THREE.Matrix4(); const color = new THREE.Color();
    points.forEach((point, index) => { matrix.makeTranslation(point.x, point.y, point.z); mesh.setMatrixAt(index, matrix); color.set(point.count === 0 ? 0xdba6af : point.count === 1 ? 0x94c5a8 : 0xe4c391); mesh.setColorAt(index, color); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.coverageGroup.add(mesh);
  }

  clearCoverage(): void { this.clearGroup(this.coverageGroup); }

  drawNavigationCells(cells: Array<{ x: number; y?: number; z: number; size: number }>): void {
    this.clearGroup(this.navGroup);
    const geometry = new THREE.BoxGeometry(0.88, 0.025, 0.88);
    const material = new THREE.MeshBasicMaterial({ color: 0x9dbbd5, transparent: true, opacity: 0.16, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, index) => {
      matrix.makeScale(cell.size, 1, cell.size).setPosition(cell.x, (cell.y ?? 0) + 0.12, cell.z);
      mesh.setMatrixAt(index, matrix);
    });
    this.navGroup.add(mesh);
  }

  drawPath(path: Vector3Data[]): void {
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
    }
    if (path.length < 2) {
      this.pathLine = undefined;
      return;
    }
    const points = path.map((point) => new THREE.Vector3(point.x, Math.max(0.28, point.y - 0.62), point.z));
    this.pathLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: COLORS.path, linewidth: 2 }),
    );
    this.pathLine.name = 'agent-path';
    this.scene.add(this.pathLine);
  }

  updatePhysics(physics: { debugGeometry(): { vertices: Float32Array; colors: Float32Array } }): void {
    if (!this.physicsGroup.visible) return;
    this.clearGroup(this.physicsGroup);
    this.clearGroup(this.coverageGroup);
    const debug = physics.debugGeometry();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(debug.vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(debug.colors, 4));
    this.physicsGroup.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true })));
  }

  dispose(): void {
    this.clearGroup(this.semanticGroup);
    this.clearRegionDraft();
    this.clearGroup(this.navGroup);
    this.clearGroup(this.physicsGroup);
    this.clearGroup(this.coverageGroup);
    this.draftMarkerGeometry.dispose();
    this.draftMarkerMaterial.dispose();
    this.semanticGroup.removeFromParent();
    this.regionDraftGroup.removeFromParent();
    this.navGroup.removeFromParent();
    this.physicsGroup.removeFromParent();
    this.coverageGroup.removeFromParent();
    if (this.pathLine) {
      this.pathLine.removeFromParent();
      this.pathLine.geometry.dispose();
      (this.pathLine.material as THREE.Material).dispose();
      this.pathLine = undefined;
    }
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        if (child.geometry !== this.draftMarkerGeometry) child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else if (child.material !== this.draftMarkerMaterial) child.material.dispose();
      }
    }
  }
}
