import type { SemanticRegionData } from '../map/MapTypes';
import type { PlacedAsset, TerrainData, TerrainDescriptor, TerrainRuntimeState, TerrainSwitchStage } from './TerrainTypes';
import { cloneTerrainData, TerrainError } from './TerrainTypes';
import type { TerrainCatalog } from './TerrainCatalog';
import { TerrainGLBImporter } from './TerrainGLBImporter';
import type { TerrainStateStore } from './TerrainStateStore';

export type TerrainManagerEvent = 'terrainWillChange' | 'terrainChanged' | 'terrainChangeFailed';
type EventHandler = (payload: { terrainId: string; error?: unknown }) => void;

export interface TerrainLifecycle<Runtime> {
  setStage(stage: TerrainSwitchStage | string): void;
  buildRuntime(state: TerrainRuntimeState, descriptor: TerrainDescriptor): Promise<Runtime>;
  commitRuntime(runtime: Runtime, state: TerrainRuntimeState, descriptor: TerrainDescriptor): void;
  disposeRuntime(runtime: Runtime): void;
  setSwitching(switching: boolean): void;
}

export class TerrainManager<Runtime> {
  private readonly importer: TerrainGLBImporter;
  private readonly listeners = new Map<TerrainManagerEvent, Set<EventHandler>>();
  private switchGeneration = 0;
  private activeTerrainId?: string;
  private activeRuntime?: Runtime;
  private activeDescriptor?: TerrainDescriptor;

  constructor(readonly catalog: TerrainCatalog, readonly stateStore: TerrainStateStore, private readonly lifecycle: TerrainLifecycle<Runtime>) {
    this.importer = new TerrainGLBImporter(catalog);
  }

  async loadInitialTerrain(): Promise<void> { await this.switchTerrain(this.catalog.getDefaultTerrain().id); }

  async switchTerrain(terrainId: string, forceSource = false): Promise<boolean> {
    if (!this.catalog.hasTerrain(terrainId)) throw new TerrainError('UNKNOWN_TERRAIN_ID', `Unknown terrain: ${terrainId}`);
    if (!forceSource && terrainId === this.activeTerrainId) return true;
    const requestId = ++this.switchGeneration;
    const descriptor = this.catalog.getTerrainById(terrainId);
    const storedBeforeSwitch = this.stateStore.get(terrainId);
    this.lifecycle.setSwitching(true); this.lifecycle.setStage('Loading GLB...'); this.emit('terrainWillChange', { terrainId });
    let candidate: Runtime | undefined;
    try {
      let state = !forceSource ? this.stateStore.get(terrainId) : undefined;
      if (!state) { state = await this.loadState(descriptor, storedBeforeSwitch?.meshRoles); if (requestId !== this.switchGeneration) return false; }
      this.lifecycle.setStage('Building physics...');
      candidate = await this.lifecycle.buildRuntime(state, descriptor);
      if (requestId !== this.switchGeneration) { this.lifecycle.disposeRuntime(candidate); return false; }
      const previous = this.activeRuntime;
      this.stateStore.set(state);
      this.lifecycle.commitRuntime(candidate, state, descriptor);
      this.activeRuntime = candidate; this.activeTerrainId = terrainId; this.activeDescriptor = descriptor;
      if (previous) this.lifecycle.disposeRuntime(previous);
      this.lifecycle.setStage('Ready'); this.emit('terrainChanged', { terrainId }); return true;
    } catch (error) {
      if (candidate) this.lifecycle.disposeRuntime(candidate);
      if (storedBeforeSwitch) this.stateStore.set(storedBeforeSwitch); else this.stateStore.delete(terrainId);
      console.error(`[TerrainManager] switch to ${terrainId} failed; keeping previous runtime.`, error);
      this.emit('terrainChangeFailed', { terrainId, error });
      return false;
    } finally {
      if (requestId === this.switchGeneration) this.lifecycle.setSwitching(false);
    }
  }

  async reloadCurrentTerrain(): Promise<boolean> {
    if (!this.activeTerrainId) return false;
    return this.switchTerrain(this.activeTerrainId, true);
  }

  getActiveTerrainId(): string | undefined { return this.activeTerrainId; }
  getActiveTerrain(): TerrainDescriptor | undefined { return this.activeDescriptor; }
  getTerrainCatalog(): TerrainCatalog { return this.catalog; }
  getActiveState(): TerrainRuntimeState | undefined { return this.activeTerrainId ? this.stateStore.get(this.activeTerrainId) : undefined; }
  on(event: TerrainManagerEvent, handler: EventHandler): () => void {
    const handlers = this.listeners.get(event) ?? new Set<EventHandler>(); handlers.add(handler); this.listeners.set(event, handlers); return () => handlers.delete(handler);
  }

  private async loadState(descriptor: TerrainDescriptor, meshRoles?: TerrainRuntimeState['meshRoles']): Promise<TerrainRuntimeState> {
    let terrainData;
    if (descriptor.data) {
      const response = await fetch(this.catalog.resolve(descriptor.data));
      if (!response.ok) throw new TerrainError('TERRAIN_PARSE_FAILED', `TerrainData load failed for ${descriptor.id}: HTTP ${response.status}`);
      const json = await response.json() as Omit<TerrainData, 'heights' | 'sampleCoverage' | 'waterGrid'> & { heights: number[]; sampleCoverage?: number[]; waterGrid?: { rows: number; cols: number; mask: number[]; heights: number[] } };
      if (json.terrainId !== descriptor.id || !Number.isInteger(json.rows) || !Number.isInteger(json.cols)
        || json.rows < 2 || json.cols < 2 || !Number.isFinite(json.width) || !Number.isFinite(json.depth)
        || json.width <= 0 || json.depth <= 0 || !Array.isArray(json.heights)
        || json.heights.length !== json.rows * json.cols || !json.heights.every(Number.isFinite)
        || (json.sampleCoverage && (json.sampleCoverage.length !== json.heights.length || !json.sampleCoverage.every((value) => value === 0 || value === 1)))
        || (json.waterGrid && (!Number.isInteger(json.waterGrid.rows) || !Number.isInteger(json.waterGrid.cols)
          || json.waterGrid.rows < 1 || json.waterGrid.cols < 1 || !Array.isArray(json.waterGrid.mask)
          || !Array.isArray(json.waterGrid.heights) || json.waterGrid.mask.length !== json.waterGrid.rows * json.waterGrid.cols
          || json.waterGrid.heights.length !== json.waterGrid.mask.length
          || !json.waterGrid.mask.every((value) => value === 0 || value === 1)
          || !json.waterGrid.heights.every(Number.isFinite)))
        || !Array.isArray(json.semanticRegions) || !Array.isArray(json.waterRegions)
        || !Array.isArray(json.detectedMeshes)) {
        throw new TerrainError('TERRAIN_PARSE_FAILED', `Invalid TerrainData for ${descriptor.id}; refusing to resample a different GLB.`);
      }
      terrainData = { ...json, heights: new Float32Array(json.heights), sampleCoverage: json.sampleCoverage ? new Uint8Array(json.sampleCoverage) : undefined,
        waterGrid: json.waterGrid ? { rows: json.waterGrid.rows, cols: json.waterGrid.cols, mask: new Uint8Array(json.waterGrid.mask), heights: new Float32Array(json.waterGrid.heights) } : undefined };
    }
    terrainData ??= await this.importer.import(descriptor, (stage) => this.lifecycle.setStage(stage), meshRoles);
    const semantic = await this.tryLoadJson<SemanticRegionData[]>(descriptor.semantic);
    if (semantic?.length) terrainData.semanticRegions = terrainData.waterGrid ? [...semantic, ...terrainData.waterRegions] : semantic;
    const assets = (await this.tryLoadJson<PlacedAsset[]>(descriptor.assets)) ?? [];
    return { terrainId: descriptor.id, terrainData: cloneTerrainData(terrainData), semanticOverrides: [], placedAssets: assets.map((asset) => ({ ...asset, terrainId: descriptor.id })), terrainDirty: false, semanticDirty: false, assetsDirty: false, meshRoles: Object.fromEntries(terrainData.detectedMeshes.map((mesh) => [mesh.name, mesh.role])) };
  }

  private async tryLoadJson<T>(path?: string): Promise<T | undefined> {
    if (!path) return undefined;
    try { const response = await fetch(this.catalog.resolve(path)); return response.ok ? await response.json() as T : undefined; }
    catch (error) { console.warn(`Optional terrain data failed to load: ${path}`, error); return undefined; }
  }

  private emit(event: TerrainManagerEvent, payload: { terrainId: string; error?: unknown }): void { this.listeners.get(event)?.forEach((handler) => handler(payload)); }
}
