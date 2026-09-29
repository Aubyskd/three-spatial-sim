import * as THREE from 'three';
import type { SpatialPoint } from '../spatial/SpatialPoint';
import { createVisibilityMatrixResult } from './VisibilityMatrix';
import { DEFAULT_VISIBILITY_CONFIG, type VisibilityConfig, type VisibilityMatrixResult, type VisibilityPairResult } from './VisibilityTypes';

export interface VisibilityEnvironment {
  terrainId: string;
  terrainRevision: number;
}

export class VisibilityAnalyzer {
  private buildingOccluders: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();

  setBuildingOccluders(objects: readonly THREE.Object3D[]): void {
    this.buildingOccluders = [...objects];
  }

  isVisible(observer: SpatialPoint, target: SpatialPoint, config: Partial<VisibilityConfig> = {}): boolean {
    return this.analyzePair(observer, target, resolveVisibilityConfig(config)).visible;
  }

  analyzePair(observer: SpatialPoint, target: SpatialPoint, config: VisibilityConfig): VisibilityPairResult {
    validatePoint(observer, 'observer'); validatePoint(target, 'target'); validateConfig(config);
    this.origin.set(observer.groundPosition.x, observer.groundPosition.y + config.observerHeightOffset, observer.groundPosition.z);
    this.target.set(target.groundPosition.x, target.groundPosition.y + config.targetHeightOffset, target.groundPosition.z);
    this.direction.copy(this.target).sub(this.origin);
    const directDistance = this.direction.length();
    if (directDistance <= config.visibilityEpsilon) return { observerId: observer.id, targetId: target.id, visible: true, directDistance };
    this.direction.multiplyScalar(1 / directDistance);
    this.raycaster.set(this.origin, this.direction); this.raycaster.near = 0; this.raycaster.far = directDistance;
    const intersections = this.raycaster.intersectObjects(this.buildingOccluders, true);
    const hit = intersections.find((intersection) => intersection.distance < directDistance - config.visibilityEpsilon);
    return {
      observerId: observer.id, targetId: target.id, visible: !hit, directDistance,
      blocker: hit ? { objectId: hit.object.name || hit.object.uuid, distance: hit.distance, point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } } : undefined,
    };
  }

  computeMatrix(
    observers: SpatialPoint[],
    targets: SpatialPoint[],
    config: Partial<VisibilityConfig> = {},
    environment: VisibilityEnvironment = { terrainId: 'unknown', terrainRevision: 0 },
  ): VisibilityMatrixResult {
    if (!observers.length || !targets.length) throw new Error('Visibility analysis requires at least one observer and one target.');
    const resolved = resolveVisibilityConfig(config);
    const analysisObservers = observers.map((point) => withAnalysisHeight(point, resolved.observerHeightOffset));
    const analysisTargets = targets.map((point) => withAnalysisHeight(point, resolved.targetHeightOffset));
    this.buildingOccluders.forEach((object) => object.updateWorldMatrix(true, true));
    const pairs: VisibilityPairResult[] = [];
    for (const observer of analysisObservers) for (const target of analysisTargets) pairs.push(this.analyzePair(observer, target, resolved));
    return createVisibilityMatrixResult(environment.terrainId, environment.terrainRevision, analysisObservers, analysisTargets, resolved, pairs);
  }
}

function withAnalysisHeight(point: SpatialPoint, offset: number): SpatialPoint {
  return { ...structuredClone(point), analysisPosition: { x: point.groundPosition.x, y: point.groundPosition.y + offset, z: point.groundPosition.z }, heightOffset: offset };
}

export function resolveVisibilityConfig(config: Partial<VisibilityConfig> = {}): VisibilityConfig {
  const resolved = { ...DEFAULT_VISIBILITY_CONFIG, ...config };
  validateConfig(resolved); return resolved;
}

function validateConfig(config: VisibilityConfig): void {
  if (![config.observerHeightOffset, config.targetHeightOffset, config.visibilityEpsilon].every(Number.isFinite)
    || config.observerHeightOffset < 0 || config.targetHeightOffset < 0 || config.visibilityEpsilon < 0) {
    throw new Error('Visibility height offsets and epsilon must be finite non-negative metres.');
  }
}

function validatePoint(point: SpatialPoint, expected: 'observer' | 'target'): void {
  if (point.type !== expected || !point.valid || ![point.groundPosition.x, point.groundPosition.y, point.groundPosition.z].every(Number.isFinite)) {
    throw new Error(`Visibility ${expected} point is invalid.`);
  }
}
