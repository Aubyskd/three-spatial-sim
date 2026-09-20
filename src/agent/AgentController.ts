import { SIMULATION } from '../config/constants';
import type { CharacterController } from '../physics/CharacterController';
import type { DebugRenderer } from '../render/DebugRenderer';
import type { Vector3Data } from '../types';
import type { Agent } from './Agent';

export class AgentController {
  private path: Vector3Data[] = [];
  private waypointIndex = 0;

  constructor(
    private readonly agent: Agent,
    private readonly character: CharacterController,
    private readonly debug: DebugRenderer,
  ) {}

  follow(path: Vector3Data[]): void {
    this.path = path.map((point) => ({ ...point }));
    this.waypointIndex = Math.min(1, Math.max(0, this.path.length - 1));
    this.agent.pathStatus = path.length > 1 ? 'moving' : 'arrived';
    this.debug.drawPath(path);
  }

  beforePhysics(dt: number): void {
    if (this.agent.pathStatus !== 'moving' || !this.path[this.waypointIndex]) {
      this.character.move({ x: 0, y: 0, z: 0 }, dt);
      return;
    }
    const target = this.path[this.waypointIndex];
    const position = this.character.position();
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.3) {
      this.waypointIndex += 1;
      if (this.waypointIndex >= this.path.length) {
        this.agent.pathStatus = 'arrived';
        this.character.move({ x: 0, y: 0, z: 0 }, dt);
        return;
      }
      return this.beforePhysics(dt);
    }
    const speed = Math.min(SIMULATION.agentSpeed, distance / dt);
    this.character.move({ x: (dx / distance) * speed, y: 0, z: (dz / distance) * speed }, dt);
  }

  afterPhysics(): void {
    this.agent.sync(this.character.position(), this.character.velocity);
  }

  stop(status: 'idle' | 'blocked' | 'error' = 'idle'): void {
    this.path = [];
    this.waypointIndex = 0;
    this.agent.pathStatus = status;
    this.debug.drawPath([]);
  }

  reset(): void {
    this.character.reset(this.agent.spawn);
    this.agent.reset();
    this.stop('idle');
  }

  deploy(position: Vector3Data): void {
    this.stop('idle');
    this.character.reset(position);
    this.agent.deploy(position);
  }

  currentPath(): Vector3Data[] {
    return this.path.map((point) => ({ ...point }));
  }
}
