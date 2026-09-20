import type { TerrainRuntimeState } from './TerrainTypes';
import { cloneTerrainData } from './TerrainTypes';

export class TerrainStateStore {
  private readonly states = new Map<string, TerrainRuntimeState>();
  has(terrainId: string): boolean { return this.states.has(terrainId); }
  get(terrainId: string): TerrainRuntimeState | undefined { return this.states.get(terrainId); }
  set(state: TerrainRuntimeState): void { this.states.set(state.terrainId, state); }
  delete(terrainId: string): void { this.states.delete(terrainId); }
  snapshot(terrainId: string): TerrainRuntimeState | undefined {
    const state = this.states.get(terrainId);
    return state ? { ...state, terrainData: cloneTerrainData(state.terrainData), semanticOverrides: structuredClone(state.semanticOverrides), placedAssets: structuredClone(state.placedAssets), meshRoles: { ...state.meshRoles } } : undefined;
  }
}
