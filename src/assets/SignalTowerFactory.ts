import * as THREE from 'three';
import type { PlacedAsset } from '../terrain/TerrainTypes';

export class SignalTowerFactory {
  create(asset: PlacedAsset, preview = false): THREE.Group {
    const group = new THREE.Group(); group.name = asset.id; group.position.set(asset.position.x, asset.position.y, asset.position.z); group.rotation.y = asset.rotationY;
    const material = new THREE.MeshStandardMaterial({ color: preview ? 0xa6d2bf : 0xf0ece6, metalness: 0.18, roughness: 0.58, transparent: preview, opacity: preview ? 0.5 : 1 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xd6a8ab, emissive: 0x6f4148, emissiveIntensity: 0.08, transparent: preview, opacity: preview ? 0.5 : 1 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 20), material); base.position.y = 0.25;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 8, 12), material); mast.position.y = 4.5;
    const equipment = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.8), accent); equipment.position.y = 5;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2, 10), accent); antenna.position.y = 9.5;
    group.add(base, mast, equipment, antenna);
    group.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return group;
  }
}
