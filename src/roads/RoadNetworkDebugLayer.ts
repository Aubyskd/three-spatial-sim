import * as THREE from 'three';
import type { GraphNode } from '../analysis/GraphTypes';
import type { RoadGraph } from './RoadGraph';

export type RoadDebugKind = 'nodes' | 'edges' | 'intersections' | 'snap' | 'lengths';

export class RoadNetworkDebugLayer {
  readonly root = new THREE.Group();
  private readonly groups: Record<RoadDebugKind, THREE.Group> = {
    nodes: new THREE.Group(), edges: new THREE.Group(), intersections: new THREE.Group(), snap: new THREE.Group(), lengths: new THREE.Group(),
  };
  constructor() { this.root.name = 'road-network-debug'; for (const [name, group] of Object.entries(this.groups)) { group.name = `road-debug-${name}`; group.visible = false; this.root.add(group); } }
  setGraph(graph: RoadGraph): void {
    for (const group of Object.values(this.groups)) disposeGroup(group);
    const nodePositions: number[] = [];
    for (const node of graph.nodes.values()) {
      nodePositions.push(node.position.x, node.position.y + 0.18, node.position.z);
      if (node.kind === 'intersection') {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xe46f63, depthTest: false })); marker.position.set(node.position.x, node.position.y + 0.2, node.position.z); marker.renderOrder = 24;
        const label = createLabel(`${node.id} · ${node.roadIds.join(',')} · L${node.layer}${node.bridge ? ' · bridge' : ''}${node.tunnel ? ' · tunnel' : ''}`);
        if (label) { label.position.copy(marker.position).add(new THREE.Vector3(0, 0.75, 0)); this.groups.intersections.add(label); }
        this.groups.intersections.add(marker);
      }
    }
    if (nodePositions.length) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3)); const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x2e748a, size: 0.36, sizeAttenuation: true, depthTest: false })); points.renderOrder = 22; this.groups.nodes.add(points); }
    for (const edge of graph.edges.values()) {
      const points = edge.geometry.map((point) => new THREE.Vector3(point.x, point.y + 0.12, point.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x4f7f8e, transparent: true, opacity: 0.82, depthTest: false })); line.renderOrder = 21; this.groups.edges.add(line);
      const label = createLabel(`${edge.id} · ${edge.length.toFixed(1)} m`); if (label) { label.position.copy(points[0]).lerp(points[points.length - 1], 0.5).add(new THREE.Vector3(0, 0.45, 0)); this.groups.lengths.add(label); }
    }
  }
  drawSnaps(nodes: GraphNode[]): void {
    disposeGroup(this.groups.snap);
    for (const node of nodes) {
      const points = [node.originalGroundPosition, node.snappedRoadPosition].map((point) => new THREE.Vector3(point.x, point.y + 0.1, point.z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0x8c9298, dashSize: 0.25, gapSize: 0.16, depthTest: false })); line.computeLineDistances(); line.renderOrder = 23; this.groups.snap.add(line);
    }
  }
  setVisible(kind: RoadDebugKind, visible: boolean): void { this.groups[kind].visible = visible; }
  clearSnaps(): void { disposeGroup(this.groups.snap); }
  dispose(): void { for (const group of Object.values(this.groups)) disposeGroup(group); this.root.removeFromParent(); }
}

function createLabel(text: string): THREE.Sprite | undefined {
  if (typeof document === 'undefined') return undefined; const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64; const context = canvas.getContext('2d'); if (!context) return undefined;
  context.fillStyle = 'rgba(255,255,255,.92)'; context.fillRect(4, 5, 504, 54); context.fillStyle = '#455b63'; context.font = '600 20px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false })); sprite.scale.set(5.6, 0.7, 1); sprite.renderOrder = 25; return sprite;
}
function disposeGroup(group: THREE.Group): void { for (const child of [...group.children]) { child.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) { object.geometry?.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { if (material instanceof THREE.SpriteMaterial) material.map?.dispose(); material.dispose(); }); } }); child.removeFromParent(); } }
