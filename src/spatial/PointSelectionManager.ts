import * as THREE from 'three';
import type { Vector3Data } from '../types';
import { cloneSpatialPoint, type SpatialPoint, type SpatialPointType, type SpatialSelectionMode } from './SpatialPoint';

export interface PointSelectionConfig {
  type: SpatialPointType;
  requiredCount: number;
  heightOffset?: number;
}

export interface PointSelectionState {
  mode: SpatialSelectionMode;
  requiredCount: number;
  selectedCount: number;
}

export interface AddSpatialPointResult {
  added: boolean;
  complete: boolean;
  point?: SpatialPoint;
  reason?: 'NO_ACTIVE_SELECTION' | 'REQUIRED_COUNT_REACHED' | 'INVALID_POSITION';
}

export class PointSelectionManager {
  readonly root = new THREE.Group();
  private readonly points = new Map<SpatialPointType, SpatialPoint[]>([
    ['observer', []], ['target', []], ['graph-node', []],
  ]);
  private readonly markers = new Map<string, THREE.Group>();
  private active?: PointSelectionConfig;

  constructor(private readonly onChange?: (state: PointSelectionState) => void) {
    this.root.name = 'spatial-analysis-points';
  }

  startSelection(config: PointSelectionConfig): PointSelectionState {
    if (!Number.isInteger(config.requiredCount) || config.requiredCount < 1) throw new Error('requiredCount must be a positive integer.');
    if (config.heightOffset !== undefined && (!Number.isFinite(config.heightOffset) || config.heightOffset < 0)) throw new Error('heightOffset must be a finite non-negative number.');
    this.active = { ...config };
    if (this.getPoints(config.type).length >= config.requiredCount) this.active = undefined;
    return this.emit();
  }

  addPoint(position: Vector3Data, metadata?: Record<string, unknown>): AddSpatialPointResult {
    const config = this.active;
    if (!config) return { added: false, complete: false, reason: 'NO_ACTIVE_SELECTION' };
    if (![position.x, position.y, position.z].every(Number.isFinite)) return { added: false, complete: false, reason: 'INVALID_POSITION' };
    const list = this.points.get(config.type)!;
    if (list.length >= config.requiredCount) { this.active = undefined; this.emit(); return { added: false, complete: true, reason: 'REQUIRED_COUNT_REACHED' }; }
    const point: SpatialPoint = {
      id: `${prefix(config.type)}${list.length + 1}`,
      type: config.type,
      groundPosition: { ...position },
      analysisPosition: { x: position.x, y: position.y + (config.heightOffset ?? 0), z: position.z },
      heightOffset: config.heightOffset,
      valid: true,
      validation: { reasons: [] },
      metadata: metadata ? structuredClone(metadata) : undefined,
    };
    list.push(point); this.addMarker(point);
    const complete = list.length >= config.requiredCount;
    if (complete) this.active = undefined;
    this.emit();
    return { added: true, complete, point: cloneSpatialPoint(point) };
  }

  finish(): PointSelectionState { this.active = undefined; return this.emit(); }

  removeLast(type?: SpatialPointType): SpatialPoint | undefined {
    const resolved = type ?? this.active?.type;
    if (!resolved) return undefined;
    const point = this.points.get(resolved)!.pop();
    if (!point) return undefined;
    this.removeMarker(point.id); this.emit(); return cloneSpatialPoint(point);
  }

  clear(type?: SpatialPointType): void {
    const types: SpatialPointType[] = type ? [type] : ['observer', 'target', 'graph-node'];
    for (const current of types) {
      for (const point of this.points.get(current)!) this.removeMarker(point.id);
      this.points.set(current, []);
      if (this.active?.type === current) this.active = undefined;
    }
    this.emit();
  }

  getPoints(type: SpatialPointType): SpatialPoint[] { return this.points.get(type)!.map(cloneSpatialPoint); }
  getState(): PointSelectionState { return this.state(); }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }

  private state(): PointSelectionState {
    return {
      mode: this.active?.type ?? 'none',
      requiredCount: this.active?.requiredCount ?? 0,
      selectedCount: this.active ? this.points.get(this.active.type)!.length : 0,
    };
  }

  private emit(): PointSelectionState { const state = this.state(); this.onChange?.(state); return state; }

  private addMarker(point: SpatialPoint): void {
    const group = new THREE.Group(); group.name = `spatial-point-${point.id}`;
    const material = new THREE.MeshBasicMaterial({ color: color(point.type), depthTest: false, transparent: true, opacity: 0.96 });
    let shape: THREE.BufferGeometry;
    if (point.type === 'observer') shape = new THREE.ConeGeometry(0.32, 0.75, 10);
    else if (point.type === 'target') shape = new THREE.OctahedronGeometry(0.38);
    else shape = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const marker = new THREE.Mesh(shape, material); marker.position.y = point.type === 'observer' ? 0.42 : 0.34; marker.renderOrder = 20;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.055, 8, 28), material.clone()); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 20;
    group.add(marker, ring);
    const label = createLabel(point.id, color(point.type)); if (label) { label.position.y = 1.15; group.add(label); }
    group.position.set(point.groundPosition.x, point.groundPosition.y, point.groundPosition.z);
    this.root.add(group); this.markers.set(point.id, group);
  }

  private removeMarker(id: string): void {
    const marker = this.markers.get(id); if (!marker) return;
    marker.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => { if (material instanceof THREE.SpriteMaterial) material.map?.dispose(); material.dispose(); });
      }
    });
    marker.removeFromParent(); this.markers.delete(id);
  }
}

function prefix(type: SpatialPointType): string { return type === 'observer' ? 'O' : type === 'target' ? 'T' : 'P'; }
function color(type: SpatialPointType): number { return type === 'observer' ? 0x497fb5 : type === 'target' ? 0xd47a60 : 0x8067ad; }

function createLabel(text: string, colorValue: number): THREE.Sprite | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  const context = canvas.getContext('2d'); if (!context) return undefined;
  context.fillStyle = 'rgba(255,255,255,.92)'; context.roundRect(18, 8, 92, 48, 14); context.fill();
  context.strokeStyle = `#${colorValue.toString(16).padStart(6, '0')}`; context.lineWidth = 4; context.stroke();
  context.fillStyle = '#3f5157'; context.font = '600 28px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 64, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(1.35, 0.68, 1); sprite.renderOrder = 21; return sprite;
}
