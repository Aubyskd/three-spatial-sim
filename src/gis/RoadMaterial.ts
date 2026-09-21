import * as THREE from 'three';

export function createRoadMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xaeb8b6, roughness: 0.9, metalness: 0.01, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
}
