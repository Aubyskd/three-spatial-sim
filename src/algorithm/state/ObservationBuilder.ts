import type { OptimizationMetrics } from '../metrics/Metrics';
import type { TerrainData } from '../../terrain/TerrainTypes';
import { hasTerrainSupport, isInferredWater, sampleTerrainHeight } from '../../terrain/TerrainDataUtils';
import type { WorldState } from './WorldState';
import type { GridObservation, Observation } from './Observation';

const SEMANTIC_CODES: Record<string, number> = { grass: 1, road: 2, water: 3, obstacle: 4, restricted: 5 };

export class ObservationBuilder {
  build(world: WorldState, terrain: TerrainData, metrics: OptimizationMetrics): Observation {
    return {
      terrain: { id: terrain.terrainId, width: terrain.width, depth: terrain.depth, minHeight: terrain.minHeight, maxHeight: terrain.maxHeight, revision: terrain.revision },
      placedAssets: world.placedAssets.map((asset) => ({ id: asset.id, type: asset.definitionId, position: { ...asset.position }, valid: !asset.invalidPlacement })),
      agent: world.agentState ? structuredClone(world.agentState) : undefined,
      metrics: { ...metrics },
      stepIndex: world.stepIndex,
    };
  }

  buildGrid(terrain: TerrainData, semanticAt: (x: number, z: number) => { type: string } | undefined, assets: WorldState['placedAssets'], rows: number, cols: number, bounds = { minX: terrain.origin.x, maxX: terrain.origin.x + terrain.width, minZ: terrain.origin.z, maxZ: terrain.origin.z + terrain.depth }): GridObservation {
    const height: number[][] = []; const semantic: number[][] = []; const occupied: number[][] = [];
    for (let row = 0; row < rows; row += 1) {
      const heightRow: number[] = []; const semanticRow: number[] = []; const occupiedRow: number[] = [];
      const z = bounds.minZ + ((row + 0.5) / rows) * (bounds.maxZ - bounds.minZ);
      for (let col = 0; col < cols; col += 1) {
        const x = bounds.minX + ((col + 0.5) / cols) * (bounds.maxX - bounds.minX);
        heightRow.push(hasTerrainSupport(terrain, x, z) ? sampleTerrainHeight(terrain, x, z) : Number.NaN);
        semanticRow.push(isInferredWater(terrain, x, z) ? SEMANTIC_CODES.water : (SEMANTIC_CODES[semanticAt(x, z)?.type ?? 'grass'] ?? 0));
        occupiedRow.push(assets.some((asset) => Math.hypot(asset.position.x - x, asset.position.z - z) <= ALGORITHM_DEFAULTS.signalTowerFootprintRadius) ? 1 : 0);
      }
      height.push(heightRow); semantic.push(semanticRow); occupied.push(occupiedRow);
    }
    return { rows, cols, height, semantic, occupied };
  }
}

import { ALGORITHM_DEFAULTS } from '../EnvironmentConfig';
