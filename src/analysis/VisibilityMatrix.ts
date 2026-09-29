import type { SpatialPoint } from '../spatial/SpatialPoint';
import type { VisibilityConfig, VisibilityMatrixResult, VisibilityPairResult } from './VisibilityTypes';

export function createVisibilityMatrixResult(
  terrainId: string,
  terrainRevision: number,
  observers: SpatialPoint[],
  targets: SpatialPoint[],
  config: VisibilityConfig,
  pairs: VisibilityPairResult[],
): VisibilityMatrixResult {
  const pairMap = new Map(pairs.map((pair) => [`${pair.observerId}\u0000${pair.targetId}`, pair]));
  return {
    type: 'visibility-matrix', terrainId, terrainRevision,
    observerIds: observers.map((point) => point.id), targetIds: targets.map((point) => point.id),
    observers: structuredClone(observers), targets: structuredClone(targets), config: { ...config }, pairs: structuredClone(pairs),
    matrix: observers.map((observer) => targets.map((target) => pairMap.get(`${observer.id}\u0000${target.id}`)?.visible ? 1 : 0)),
  };
}

export function visibilityMatrixToCsv(result: VisibilityMatrixResult): string {
  const rows = [
    ['observer/target', ...result.targetIds],
    ...result.observerIds.map((id, index) => [id, ...result.matrix[index].map(String)]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
