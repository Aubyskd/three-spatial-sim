import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vector3Data } from '../types';
import { SIMULATION } from '../config/constants';

interface CharacterPhysicsContext {
  rapier: typeof RAPIER;
  world: RAPIER.World;
}

export class CharacterController {
  readonly body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  velocity: Vector3Data = { x: 0, y: 0, z: 0 };
  private sizeScale: number;

  constructor(
    private readonly physics: CharacterPhysicsContext,
    spawn: Vector3Data,
    sizeScale = 1,
  ) {
    this.sizeScale = sizeScale;
    const { rapier, world } = physics;
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(
      rapier.ColliderDesc.capsule(SIMULATION.agentHalfHeight * sizeScale, SIMULATION.agentRadius * sizeScale).setFriction(0),
      this.body,
    );
    this.controller = world.createCharacterController(0.03);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableSnapToGround(0.25);
    this.controller.enableAutostep(0.25, 0.2, true);
    this.controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
  }

  setSizeScale(scale: number): void {
    if (this.sizeScale === scale) return;
    this.physics.world.removeCollider(this.collider, true);
    this.collider = this.physics.world.createCollider(
      this.physics.rapier.ColliderDesc.capsule(SIMULATION.agentHalfHeight * scale, SIMULATION.agentRadius * scale).setFriction(0),
      this.body,
    );
    this.sizeScale = scale;
  }

  move(desiredVelocity: Vector3Data, dt: number): void {
    const desired = { x: desiredVelocity.x * dt, y: -0.1 * dt, z: desiredVelocity.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const movement = this.controller.computedMovement();
    const position = this.body.translation();
    this.body.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z });
    this.velocity = { x: movement.x / dt, y: movement.y / dt, z: movement.z / dt };
  }

  reset(position: Vector3Data): void {
    this.body.setTranslation(position, true);
    this.body.setNextKinematicTranslation(position);
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  position(): Vector3Data {
    const position = this.body.translation();
    return { x: position.x, y: position.y, z: position.z };
  }
}
