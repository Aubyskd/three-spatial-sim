import type { TerrainDescriptor, TerrainManifestV2 } from './TerrainTypes';
import { TerrainError } from './TerrainTypes';

export class TerrainCatalog {
  private readonly byId = new Map<string, TerrainDescriptor>();

  private constructor(readonly manifest: TerrainManifestV2, readonly baseUrl: string) {
    for (const terrain of manifest.terrains) {
      if (this.byId.has(terrain.id)) throw new TerrainError('TERRAIN_PARSE_FAILED', `Duplicate terrain id: ${terrain.id}`);
      this.byId.set(terrain.id, terrain);
    }
    if (!this.byId.has(manifest.defaultTerrain)) throw new TerrainError('UNKNOWN_TERRAIN_ID', `Default terrain does not exist: ${manifest.defaultTerrain}`);
  }

  static async load(baseUrl = '/assets/maps/terrain-demo'): Promise<TerrainCatalog> {
    const response = await fetch(`${baseUrl}/manifest.json`);
    if (!response.ok) throw new TerrainError('TERRAIN_PARSE_FAILED', `Manifest load failed: ${response.status}`);
    const manifest = (await response.json()) as TerrainManifestV2;
    if (manifest.version !== 2 || !Array.isArray(manifest.terrains) || manifest.terrains.length === 0) throw new TerrainError('TERRAIN_PARSE_FAILED', 'Manifest is not a valid terrain catalog v2.');
    return new TerrainCatalog(manifest, baseUrl);
  }

  getAllTerrains(): readonly TerrainDescriptor[] { return [...this.byId.values()]; }
  getTerrainById(id: string): TerrainDescriptor {
    const terrain = this.byId.get(id);
    if (!terrain) throw new TerrainError('UNKNOWN_TERRAIN_ID', `Unknown terrain id: ${id}`);
    return terrain;
  }
  getDefaultTerrain(): TerrainDescriptor { return this.getTerrainById(this.manifest.defaultTerrain); }
  hasTerrain(id: string): boolean { return this.byId.has(id); }
  resolve(path: string): string { return `${this.baseUrl}/${path}`; }
}
