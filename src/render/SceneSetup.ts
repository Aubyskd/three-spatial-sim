import * as THREE from 'three';
import { COLORS } from '../config/constants';

export interface SceneEssentials {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createSceneEssentials(): SceneEssentials {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.fog = new THREE.FogExp2(COLORS.background, 0.0035);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(42, 43, 48);

  scene.add(new THREE.HemisphereLight(0xf8fbff, 0xc8d9c8, 1.65));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const sun = new THREE.DirectionalLight(0xfff3e6, 2.5);
  sun.position.set(-22, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xe4f0ff, 0.75);
  fill.position.set(28, 22, -32);
  scene.add(fill);

  return { scene, camera };
}
