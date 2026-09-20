import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MapObjectData } from '../map/MapTypes';

export class ModelLoader {
  private readonly loader = new GLTFLoader();

  async loadModel(url: string, transform: MapObjectData): Promise<THREE.Object3D> {
    try {
      const gltf = await this.loader.loadAsync(url);
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const measured = bounds.getSize(new THREE.Vector3());
      const measuredMax = Math.max(measured.x, measured.y, measured.z);
      const desiredMax = Math.max(transform.size.x, transform.size.y, transform.size.z);
      if (Number.isFinite(measuredMax) && measuredMax > 0) {
        const fit = desiredMax / measuredMax;
        model.scale.setScalar(fit);
      }
      const fittedBounds = new THREE.Box3().setFromObject(model);
      const center = fittedBounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -fittedBounds.min.y, -center.z);
      const root = new THREE.Group();
      root.add(model);
      this.applyTransform(root, transform);
      return root;
    } catch (error) {
      console.warn(`GLB model failed to load (${url}); using box fallback.`, error);
      return this.createFallback(transform);
    }
  }

  createFallback(transform: MapObjectData): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(transform.size.x, transform.size.y, transform.size.z),
      new THREE.MeshStandardMaterial({ color: transform.type === 'building' ? 0xa9bfd0 : 0xe2bdab, roughness: 0.72 }),
    );
    this.applyTransform(mesh, transform);
    return mesh;
  }

  private applyTransform(object: THREE.Object3D, transform: MapObjectData): void {
    object.position.set(transform.position.x, transform.position.y, transform.position.z);
    object.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
    object.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
    object.name = transform.id;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }
}
