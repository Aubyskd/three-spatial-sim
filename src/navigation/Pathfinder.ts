import type { SemanticMap } from '../semantic/SemanticMap';
import type { Vector3Data } from '../types';
import type { NavigationCell } from './NavMeshManager';

interface NavigationProvider {
  readonly cellSize: number;
  isWalkable(x: number, z: number): boolean;
  getCell(x: number, z: number): NavigationCell | undefined;
  neighbors(cell: NavigationCell): NavigationCell[];
  key(x: number, z: number): string;
  computeRecastPath(start: Vector3Data, end: Vector3Data): Vector3Data[] | null;
}

export interface PathResult {
  success: boolean;
  path: Vector3Data[];
  reason?: string;
  source?: 'recast' | 'grid-fallback';
}

export class Pathfinder {
  private agentHeightOffset = 0.9;
  constructor(
    private readonly nav: NavigationProvider,
    private readonly semantics: SemanticMap,
  ) {}

  setAgentHeightOffset(offset: number): void { this.agentHeightOffset = offset; }

  findPath(start: Vector3Data, target: Vector3Data): PathResult {
    const targetValidation = this.semantics.validateTarget(target.x, target.z);
    if (!targetValidation.valid) return { success: false, path: [], reason: targetValidation.reason };
    if (!this.nav.isWalkable(target.x, target.z)) {
      return { success: false, path: [], reason: '目标离障碍物太近或不在导航网格上' };
    }

    const recast = this.nav.computeRecastPath(start, target)?.map((point) => ({ ...point, y: point.y - 0.9 + this.agentHeightOffset }));
    if (recast && recast.length >= 2) {
      recast[0] = { ...start };
      recast[recast.length - 1] = { ...target };
      if (this.pathSegmentsAreWalkable(recast)) return { success: true, path: recast, source: 'recast' };
    }

    const fallback = this.findGridPath(start, target);
    if (fallback.length > 0) {
      const path = this.simplify([{ ...start }, ...fallback, { ...target }]);
      if (this.pathSegmentsAreWalkable(path)) return { success: true, path, source: 'grid-fallback' };
    }
    return { success: false, path: [], reason: '没有找到可通行路径' };
  }

  /** Returns every independent valid candidate currently available for graph analysis. */
  findPathCandidates(start: Vector3Data, target: Vector3Data): Vector3Data[][] {
    if (!this.semantics.validateTarget(start.x, start.z).valid || !this.semantics.validateTarget(target.x, target.z).valid
      || !this.nav.isWalkable(start.x, start.z) || !this.nav.isWalkable(target.x, target.z)) return [];
    const candidates: Vector3Data[][] = [];
    const recast = this.nav.computeRecastPath(start, target)?.map((point) => ({ ...point, y: point.y - 0.9 }));
    if (recast && recast.length >= 2) {
      recast[0] = { ...start }; recast[recast.length - 1] = { ...target };
      if (this.pathSegmentsAreWalkable(recast)) candidates.push(recast);
    }
    const fallback = this.findGridPath(start, target, false, 0);
    if (fallback.length > 0) {
      const path = this.simplify([{ ...start }, ...fallback, { ...target }]);
      if (this.pathSegmentsAreWalkable(path)) candidates.push(path);
    }
    return candidates;
  }

  private findGridPath(start: Vector3Data, target: Vector3Data, weighted = true, heightOffset = this.agentHeightOffset): Vector3Data[] {
    const startCell = this.nav.getCell(start.x, start.z);
    const endCell = this.nav.getCell(target.x, target.z);
    if (!startCell || !endCell) return [];

    const open = new Map<string, NavigationCell>([[this.nav.key(startCell.x, startCell.z), startCell]]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[this.nav.key(startCell.x, startCell.z), 0]]);
    const fScore = new Map<string, number>([[this.nav.key(startCell.x, startCell.z), weighted ? this.distance(startCell, endCell) : this.spatialDistance(startCell, endCell)]]);

    while (open.size > 0) {
      const currentEntry = [...open.entries()].reduce((best, entry) =>
        (fScore.get(entry[0]) ?? Infinity) < (fScore.get(best[0]) ?? Infinity) ? entry : best,
      );
      const [currentKey, current] = currentEntry;
      if (currentKey === this.nav.key(endCell.x, endCell.z)) {
        return this.reconstruct(currentKey, cameFrom).map((cell) => ({ x: cell.x, y: (cell.y ?? start.y - heightOffset) + heightOffset, z: cell.z }));
      }
      open.delete(currentKey);
      for (const neighbor of this.nav.neighbors(current)) {
        if (this.semantics.segmentIntersectsBlocked(current, neighbor)) continue;
        const neighborKey = this.nav.key(neighbor.x, neighbor.z);
        const baseCost = weighted ? this.distance(current, neighbor) : this.spatialDistance(current, neighbor);
        const moveCost = baseCost * (weighted ? this.semantics.movementCostAt(neighbor.x, neighbor.z) : 1);
        const tentative = (gScore.get(currentKey) ?? Infinity) + moveCost;
        if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue;
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentative);
        fScore.set(neighborKey, tentative + (weighted ? this.distance(neighbor, endCell) : this.spatialDistance(neighbor, endCell)));
        open.set(neighborKey, neighbor);
      }
    }
    return [];
  }

  private reconstruct(endKey: string, cameFrom: Map<string, string>): NavigationCell[] {
    const path: NavigationCell[] = [];
    let key: string | undefined = endKey;
    while (key) {
      const [x, z] = key.split(',').map(Number);
      path.push(this.nav.getCell(x, z) ?? { x, z, size: this.nav.cellSize });
      key = cameFrom.get(key);
    }
    return path.reverse();
  }

  private simplify(path: Vector3Data[]): Vector3Data[] {
    if (path.length < 3) return path;
    const result = [path[0]];
    let anchor = 0;
    for (let candidate = 2; candidate < path.length; candidate += 1) {
      if (!this.segmentWalkable(path[anchor], path[candidate])) {
        result.push(path[candidate - 1]);
        anchor = candidate - 1;
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }

  private pathSegmentsAreWalkable(path: Vector3Data[]): boolean {
    return path.every((point, index) => index === 0 || this.segmentWalkable(path[index - 1], point));
  }

  private segmentWalkable(a: Vector3Data, b: Vector3Data): boolean {
    if (this.semantics.segmentIntersectsBlocked(a, b)) return false;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(length / 0.35);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / Math.max(1, steps);
      if (!this.nav.isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  private distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
  private spatialDistance(a: { x: number; y?: number; z: number }, b: { x: number; y?: number; z: number }): number {
    return Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
  }
}
