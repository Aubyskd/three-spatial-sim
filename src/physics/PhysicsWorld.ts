import RAPIER from '@dimforge/rapier3d-compat';
import type { WorldMap } from '../map/MapTypes';
import { ColliderFactory } from './ColliderFactory';

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly rapier = RAPIER;
  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  static async create(map: WorldMap): Promise<PhysicsWorld> {
    await RAPIER.init();
    const physics = new PhysicsWorld();
    const colliders = new ColliderFactory(RAPIER, physics.world);
    colliders.createTerrain(map.terrain);
    map.objects.filter((object) => !object.walkable).forEach((object) => colliders.createStaticBox(object));
    return physics;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  debugGeometry(): { vertices: Float32Array; colors: Float32Array } {
    return this.world.debugRender();
  }
}
