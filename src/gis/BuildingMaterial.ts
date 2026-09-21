import * as THREE from 'three';

export function createBuildingMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xd7c8bd, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide });
}
