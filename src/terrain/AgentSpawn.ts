import { SIMULATION } from '../config/constants';
import type { Vector3Data } from '../types';
import { hasTerrainSupport, sampleTerrainHeight } from './TerrainDataUtils';
import type { TerrainData } from './TerrainTypes';

/** Cells have already passed the navigation support, water, slope and region checks. */
export function chooseAgentSpawn(
  terrain: TerrainData,
  cells: readonly { x: number; z: number }[],
  preferred?: { x: number; z: number },
): Vector3Data | null {
  const center = preferred ?? { x: terrain.origin.x + terrain.width / 2, z: terrain.origin.z + terrain.depth / 2 };
  let best: Vector3Data | null = null;
  let distance = Infinity;
  for (const cell of cells) {
    if (!hasTerrainSupport(terrain, cell.x, cell.z)) continue;
    const height = sampleTerrainHeight(terrain, cell.x, cell.z);
    if (!Number.isFinite(height)) continue;
    const candidateDistance = Math.hypot(cell.x - center.x, cell.z - center.z);
    if (candidateDistance >= distance) continue;
    distance = candidateDistance;
    best = { x: cell.x, y: height + SIMULATION.agentHalfHeight + SIMULATION.agentRadius + 0.05, z: cell.z };
  }
  return best;
}
