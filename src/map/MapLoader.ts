import type { MapAdapter, MapManifest, SemanticRegionData, WorldMap } from './MapTypes';

export class MapLoader {
  constructor(private readonly adapter: MapAdapter) {}

  async load(): Promise<WorldMap> {
    const manifestUrl = `${this.adapter.baseUrl}/manifest.json`;
    const manifest = await this.fetchJson<MapManifest>(manifestUrl, 'map manifest');
    const semanticUrl = `${this.adapter.baseUrl}/${manifest.semantic.source}`;
    const regions = await this.fetchJson<SemanticRegionData[]>(semanticUrl, 'semantic regions');
    return this.adapter.createWorldMap(manifest, regions);
  }

  private async fetchJson<T>(url: string, label: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${label}: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  }
}
