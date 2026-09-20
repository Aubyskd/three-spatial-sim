import { Entity } from './Entity';
import type { WorldMap } from '../map/MapTypes';

export class World {
  readonly entities = new Map<string, Entity>();

  constructor(readonly map: WorldMap) {
    for (const item of map.objects) {
      this.add(
        new Entity({
          id: item.id,
          type: item.type,
          position: item.position,
          rotation: item.rotation,
          scale: item.scale,
          semanticType: item.semanticType,
          walkable: item.walkable,
        }),
      );
    }
  }

  add(entity: Entity): void {
    if (this.entities.has(entity.id)) throw new Error(`Duplicate entity id: ${entity.id}`);
    this.entities.set(entity.id, entity);
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }
}
