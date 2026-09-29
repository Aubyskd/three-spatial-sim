import * as THREE from 'three';
import type { SpatialPoint } from '../spatial/SpatialPoint';
import type { SpatialGraph } from './GraphTypes';
import type { VisibilityMatrixResult } from './VisibilityTypes';

export class SpatialAnalysisDebugLayer {
  readonly root = new THREE.Group();
  private readonly visibility = new THREE.Group();
  private readonly graph = new THREE.Group();

  constructor() {
    this.root.name = 'spatial-analysis-debug';
    this.visibility.name = 'visibility-debug'; this.graph.name = 'reachability-graph-debug';
    this.root.add(this.visibility, this.graph);
  }

  drawVisibility(result: VisibilityMatrixResult): void {
    disposeGroup(this.visibility);
    const observers = new Map(result.observers.map((point) => [point.id, point]));
    const targets = new Map(result.targets.map((point) => [point.id, point]));
    for (const pair of result.pairs) {
      const observer = observers.get(pair.observerId); const target = targets.get(pair.targetId);
      if (!observer || !target) continue;
      const start = elevated(observer, result.config.observerHeightOffset); const end = elevated(target, result.config.targetHeightOffset);
      this.visibility.add(groundToAnalysis(observer, start, 0x497fb5), groundToAnalysis(target, end, 0xd47a60));
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const material = pair.visible
        ? new THREE.LineBasicMaterial({ color: 0x4c9b72, transparent: true, opacity: 0.84, depthTest: false })
        : new THREE.LineDashedMaterial({ color: 0xc75f68, dashSize: 0.8, gapSize: 0.45, transparent: true, opacity: 0.92, depthTest: false });
      const line = new THREE.Line(geometry, material); line.name = `visibility-${pair.observerId}-${pair.targetId}`; line.renderOrder = 18;
      if (!pair.visible) line.computeLineDistances();
      const midpoint = start.clone().lerp(end, 0.5); const label = createTextSprite(pair.visible ? 'VISIBLE' : 'BLOCKED', pair.visible ? 0x4c9b72 : 0xc75f68);
      if (label) { label.position.copy(midpoint).add(new THREE.Vector3(0, 0.42, 0)); this.visibility.add(label); }
      if (pair.blocker) {
        const blocker = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xc75f68, depthTest: false }));
        blocker.position.set(pair.blocker.point.x, pair.blocker.point.y, pair.blocker.point.z); blocker.renderOrder = 19; this.visibility.add(blocker);
      }
      this.visibility.add(line);
    }
  }

  drawGraph(graph: SpatialGraph): void {
    disposeGroup(this.graph);
    for (const node of graph.nodes) {
      if (node.snapDistance <= 0.01) continue;
      const snapGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(node.originalGroundPosition.x, node.originalGroundPosition.y + 0.08, node.originalGroundPosition.z),
        new THREE.Vector3(node.snappedRoadPosition.x, node.snappedRoadPosition.y + 0.08, node.snappedRoadPosition.z),
      ]);
      const snapLine = new THREE.Line(snapGeometry, new THREE.LineDashedMaterial({ color: 0x8c9298, dashSize: 0.25, gapSize: 0.18, depthTest: false }));
      snapLine.computeLineDistances(); snapLine.renderOrder = 17; this.graph.add(snapLine);
    }
    for (const edge of graph.edges) {
      const points = edge.roadPath.map((point) => new THREE.Vector3(point.x, point.y + 0.12, point.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x6d65a8, transparent: true, opacity: 0.9, depthTest: false }));
      line.name = `graph-edge-${edge.id}`; line.renderOrder = 18; this.graph.add(line);
      const label = createTextSprite(`${edge.cost.toFixed(1)} m`, 0x6d65a8);
      if (label) { label.position.copy(pathMidpoint(points)).add(new THREE.Vector3(0, 0.38, 0)); this.graph.add(label); }
    }
  }

  clearVisibility(): void { disposeGroup(this.visibility); }
  clearGraph(): void { disposeGroup(this.graph); }
  clear(): void { this.clearVisibility(); this.clearGraph(); }
  dispose(): void { this.clear(); this.root.removeFromParent(); }
}

function elevated(point: SpatialPoint, offset: number): THREE.Vector3 {
  return new THREE.Vector3(point.groundPosition.x, point.groundPosition.y + offset, point.groundPosition.z);
}

function groundToAnalysis(point: SpatialPoint, analysis: THREE.Vector3, color: number): THREE.Group {
  const group = new THREE.Group();
  const ground = new THREE.Vector3(point.groundPosition.x, point.groundPosition.y, point.groundPosition.z);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ground, analysis]), new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.12, depthTest: false }));
  line.computeLineDistances(); line.renderOrder = 19;
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color, depthTest: false })); marker.position.copy(analysis); marker.renderOrder = 20;
  group.add(line, marker); return group;
}

function pathMidpoint(points: THREE.Vector3[]): THREE.Vector3 {
  if (!points.length) return new THREE.Vector3();
  const lengths: number[] = []; let total = 0;
  for (let index = 1; index < points.length; index += 1) { total += points[index - 1].distanceTo(points[index]); lengths.push(total); }
  const half = total / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    if (lengths[index] < half) continue;
    const previous = index === 0 ? 0 : lengths[index - 1];
    return points[index].clone().lerp(points[index + 1], (half - previous) / Math.max(1e-9, lengths[index] - previous));
  }
  return points[points.length - 1].clone();
}

function createTextSprite(text: string, color: number): THREE.Sprite | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const context = canvas.getContext('2d'); if (!context) return undefined;
  context.fillStyle = 'rgba(255,255,255,.9)'; context.roundRect(8, 8, 240, 48, 12); context.fill();
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; context.lineWidth = 3; context.stroke();
  context.fillStyle = '#3f5157'; context.font = '600 22px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 128, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(2.3, 0.58, 1); sprite.renderOrder = 21; return sprite;
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      if (object instanceof THREE.Line || object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => { if (material instanceof THREE.SpriteMaterial) material.map?.dispose(); material.dispose(); });
      }
    });
    child.removeFromParent();
  }
}
