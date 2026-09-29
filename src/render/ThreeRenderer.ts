import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSceneEssentials } from './SceneSetup';

export class ThreeRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(private readonly host: HTMLElement) {
    const essentials = createSceneEssentials();
    this.scene = essentials.scene;
    this.camera = essentials.camera;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.className = 'simulation-canvas';
    this.host.prepend(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 110;
    this.controls.update();
    window.addEventListener('resize', this.resize);
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  groundPointFromEvent(event: PointerEvent, ground: THREE.Object3D): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(ground, false)[0]?.point ?? null;
  }

  focusTerrain(width: number, depth: number, maxHeight: number, centerX = 0, centerZ = 0, minHeight = 0): void {
    const span = Math.max(width, depth, 10);
    const direction = new THREE.Vector3(1, 0.8, 1).normalize();
    this.controls.target.set(centerX, (minHeight + maxHeight) / 2, centerZ);
    this.controls.maxDistance = Math.max(110, span * 3);
    this.camera.position.copy(this.controls.target).addScaledVector(direction.lengthSq() > 0 ? direction : new THREE.Vector3(1, 0.8, 1).normalize(), span * 1.25);
    this.camera.near = Math.max(0.05, Math.min(1, span / 1000));
    this.camera.far = Math.max(300, span * 8);
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = Math.min(0.0035, 0.5 / span);
    this.updateCameraViewport();
    this.controls.update();
  }

  focusAgent(position: { x: number; y: number; z: number }): void {
    this.controls.target.set(position.x, position.y, position.z);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(8, 8, 8));
    this.camera.near = 0.05;
    this.updateCameraViewport();
    this.controls.update();
  }

  setFieldOfView(degrees: number): void {
    this.camera.fov = degrees;
    this.updateCameraViewport();
  }

  private readonly updateCameraViewport = (): void => {
    // Floating UI must never modify the camera projection. Previously the
    // panel position changed setViewOffset while dragging, which looked like
    // OrbitControls was rotating/panning the scene with the panel.
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  };

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.updateCameraViewport();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
