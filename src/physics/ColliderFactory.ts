import type RAPIER from '@dimforge/rapier3d-compat';
import type { MapObjectData, TerrainData } from '../map/MapTypes';

export class ColliderFactory {
  constructor(
    private readonly rapier: typeof RAPIER,
    private readonly world: RAPIER.World,
  ) {}

  createTerrain(data: TerrainData): RAPIER.Collider {
    const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.12, 0));
    return this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(data.width / 2, 0.12, data.depth / 2).setFriction(1.0),
      body,
    );
  }

  createStaticBox(data: MapObjectData): RAPIER.Collider {
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(data.position.x, data.position.y, data.position.z),
    );
    return this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(data.size.x / 2, data.size.y / 2, data.size.z / 2).setFriction(0.9),
      body,
    );
  }
}
