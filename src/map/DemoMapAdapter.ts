import type { MapAdapter, MapManifest, MapObjectData, SemanticRegionData, WorldMap } from './MapTypes';

export class DemoMapAdapter implements MapAdapter {
  readonly baseUrl = '/assets/maps/demo-map';

  createWorldMap(manifest: MapManifest, regions: SemanticRegionData[]): WorldMap {
    const objects: MapObjectData[] = [
      this.building('building-north', -7, -9, 10, 8, 5),
      this.building('building-south', 16, 13, 11, 8, 6),
      this.building('building-east', 18, -15, 8, 12, 4),
      {
        id: 'demo-model',
        type: 'prop',
        position: { x: -21, y: 1, z: 15 },
        rotation: { x: 0, y: Math.PI / 5, z: 0 },
        scale: { x: 1.7, y: 1.7, z: 1.7 },
        size: { x: 2, y: 2, z: 2 },
        modelUrl: '/assets/models/demo-model.glb',
        semanticType: 'obstacle',
        walkable: false,
      },
    ];

    return {
      terrain: {
        type: manifest.terrain.type,
        source: manifest.terrain.source ? `${this.baseUrl}/${manifest.terrain.source}` : undefined,
        heightScale: manifest.terrain.heightScale ?? 0.35,
        width: manifest.size.width,
        depth: manifest.size.depth,
      },
      objects,
      regions,
      spawnPoints: {
        agent: { x: -24, y: 0.9, z: -22 },
        target: { x: 24, y: 0.12, z: 22 },
      },
      metadata: { name: manifest.name, version: manifest.version, units: manifest.units },
    };
  }

  createFallbackWorldMap(): WorldMap {
    const manifest: MapManifest = {
      name: 'demo-map-fallback',
      version: 1,
      units: 'meters',
      size: { width: 60, depth: 60 },
      terrain: { type: 'procedural', heightScale: 0.35 },
      semantic: { source: 'semantic/regions.json' },
    };
    const rectangle = (
      id: string,
      type: SemanticRegionData['type'],
      walkable: boolean,
      x: number,
      z: number,
      width: number,
      depth: number,
      movementCost = walkable ? 1 : 1000,
    ): SemanticRegionData => ({
      id,
      type,
      walkable,
      movementCost,
      shape: { kind: 'rectangle', center: { x, z }, width, depth },
    });
    return this.createWorldMap(manifest, [
      rectangle('grass-west', 'grass', true, -20, 0, 20, 60, 1.5),
      rectangle('road-main', 'road', true, 8, 0, 36, 60, 1),
      rectangle('water-lake', 'water', false, 4, 1, 14, 22),
      rectangle('building-north', 'obstacle', false, -7, -9, 10, 8),
      rectangle('building-south', 'obstacle', false, 16, 13, 11, 8),
      rectangle('building-east', 'obstacle', false, 18, -15, 8, 12),
    ]);
  }

  private building(id: string, x: number, z: number, width: number, depth: number, height: number): MapObjectData {
    return {
      id,
      type: 'building',
      position: { x, y: height / 2, z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      size: { x: width, y: height, z: depth },
      semanticType: 'obstacle',
      walkable: false,
    };
  }
}
