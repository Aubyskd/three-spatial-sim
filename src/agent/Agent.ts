import * as THREE from 'three';
import { COLORS, SIMULATION } from '../config/constants';
import type { Vector3Data, PathStatus } from '../types';

export class Agent {
  readonly object3D: THREE.Group;
  position: Vector3Data;
  velocity: Vector3Data = { x: 0, y: 0, z: 0 };
  pathStatus: PathStatus = 'idle';
  private readonly visualRoot = new THREE.Group();
  private sizeScale = 1;
  private readonly locator = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0x389c70, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  );

  constructor(spawn: Vector3Data, sizeScale = 1) {
    this.spawn = { ...spawn };
    this.position = { ...spawn };
    this.object3D = new THREE.Group();
    this.object3D.name = 'agent';
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(SIMULATION.agentRadius, SIMULATION.agentHalfHeight * 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: COLORS.agent, emissive: 0x35584d, emissiveIntensity: 0.12, roughness: 0.48 }),
    );
    body.name = 'agent-capsule';
    body.castShadow = true;
    const direction = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.42, 8),
      new THREE.MeshStandardMaterial({ color: 0xfffdfa, emissive: 0x8daea9, emissiveIntensity: 0.14 }),
    );
    direction.rotation.x = Math.PI / 2;
    direction.position.set(0, 0.3, -0.55);
    this.locator.name = 'agent-overview-locator';
    this.locator.renderOrder = 100;
    this.locator.visible = false;
    this.visualRoot.add(body, direction);
    this.object3D.add(this.visualRoot, this.locator);
    this.setSizeScale(sizeScale);
    this.syncObject();
  }

  spawn: Vector3Data;

  setSizeScale(scale: number): void {
    this.sizeScale = scale;
    this.visualRoot.scale.setScalar(scale);
  }

  /** Preserve physical dimensions; show a screen-sized location ring in map overview. */
  updateLocator(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    const distance = camera.position.distanceTo(this.object3D.position);
    const metresPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (Math.max(1, viewportHeight) * camera.zoom);
    const capsuleHeight = 2 * (SIMULATION.agentHalfHeight + SIMULATION.agentRadius) * this.sizeScale;
    this.locator.visible = capsuleHeight / Math.max(metresPerPixel, 1e-8) < 14;
    this.locator.scale.setScalar(Math.max(0.1, metresPerPixel * 10));
    this.locator.quaternion.copy(this.object3D.quaternion).invert().multiply(camera.quaternion);
  }

  deploy(position: Vector3Data): void {
    this.spawn = { ...position };
    this.position = { ...position };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.pathStatus = 'idle';
    this.syncObject();
  }

  sync(position: Vector3Data, velocity: Vector3Data): void {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.syncObject();
    if (Math.hypot(velocity.x, velocity.z) > 0.05) {
      this.object3D.rotation.y = Math.atan2(-velocity.x, -velocity.z);
    }
  }

  reset(): void {
    this.position = { ...this.spawn };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.pathStatus = 'idle';
    this.syncObject();
  }

  private syncObject(): void {
    this.object3D.position.set(this.position.x, this.position.y, this.position.z);
  }
}
