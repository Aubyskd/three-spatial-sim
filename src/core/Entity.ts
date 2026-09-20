import type { SemanticType } from '../map/MapTypes';
import type { Vector3Data } from '../types';

export interface EntityInit {
  id: string;
  type: string;
  position: Vector3Data;
  rotation?: Vector3Data;
  scale?: Vector3Data;
  semanticType: SemanticType;
  walkable: boolean;
}

/** Logical simulation entity. Rendering and physics handles live in their own modules. */
export class Entity {
  readonly id: string;
  readonly type: string;
  position: Vector3Data;
  rotation: Vector3Data;
  scale: Vector3Data;
  semanticType: SemanticType;
  walkable: boolean;

  constructor(init: EntityInit) {
    this.id = init.id;
    this.type = init.type;
    this.position = { ...init.position };
    this.rotation = init.rotation ? { ...init.rotation } : { x: 0, y: 0, z: 0 };
    this.scale = init.scale ? { ...init.scale } : { x: 1, y: 1, z: 1 };
    this.semanticType = init.semanticType;
    this.walkable = init.walkable;
  }
}
