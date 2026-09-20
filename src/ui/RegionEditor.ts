import type { SemanticRegion } from '../semantic/SemanticRegion';
import type { SemanticMap } from '../semantic/SemanticMap';

export type RegionEditorResult =
  | { state: 'created'; region: SemanticRegion }
  | { state: 'invalid'; reason: string };

type Point = { x: number; z: number };
const MIN_SPACING = 0.05;

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const ac = cross(a, b, c); const ad = cross(a, b, d);
  const ca = cross(c, d, a); const cb = cross(c, d, b);
  const onEdge = (p: Point, q: Point, r: Point) =>
    r.x >= Math.min(p.x, q.x) - 1e-8 && r.x <= Math.max(p.x, q.x) + 1e-8
    && r.z >= Math.min(p.z, q.z) - 1e-8 && r.z <= Math.max(p.z, q.z) + 1e-8;
  if (Math.abs(ac) < 1e-8 && onEdge(a, b, c)) return true;
  if (Math.abs(ad) < 1e-8 && onEdge(a, b, d)) return true;
  if (Math.abs(ca) < 1e-8 && onEdge(c, d, a)) return true;
  if (Math.abs(cb) < 1e-8 && onEdge(c, d, b)) return true;
  return ac * ad < 0 && ca * cb < 0;
}

export class RegionEditor {
  enabled = false;
  private points: Point[] = [];

  constructor(private readonly semantics: SemanticMap) {}

  begin(): void {
    this.enabled = true;
    this.points = [];
  }

  cancel(): void {
    this.enabled = false;
    this.points = [];
  }

  getPoints(): readonly Point[] { return this.points; }

  undoPoint(): boolean {
    if (!this.enabled || !this.points.length) return false;
    this.points.pop();
    return true;
  }

  addPoint(point: Point): { added: boolean; reason?: string } {
    if (!this.enabled) return { added: false, reason: '选区编辑尚未开始。' };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return { added: false, reason: '请选择有效的地形位置。' };
    if (this.points.some((existing) => Math.hypot(existing.x - point.x, existing.z - point.z) < MIN_SPACING)) {
      return { added: false, reason: '点位太接近已有顶点。' };
    }
    const last = this.points.at(-1);
    if (last && this.points.slice(0, -2).some((start, index) => intersects(start, this.points[index + 1], last, point))) {
      return { added: false, reason: '边线不能交叉，请重新选择点位。' };
    }
    this.points.push({ ...point });
    return { added: true };
  }

  finish(): RegionEditorResult {
    if (!this.enabled || this.points.length < 3) return { state: 'invalid', reason: '至少选择三个点才能闭合选区。' };
    const points = this.points;
    const first = points[0]; const last = points[points.length - 1];
    if (points.slice(1, -2).some((start, index) => intersects(start, points[index + 2], last, first))) {
      return { state: 'invalid', reason: '闭合边线与其他边相交，请撤销并调整点位。' };
    }
    const area = Math.abs(points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + point.x * next.z - next.x * point.z;
    }, 0)) / 2;
    if (area < 0.01) return { state: 'invalid', reason: '选区面积太小或点位共线。' };
    const region = this.semantics.manual.addRestrictedPolygon(points);
    this.cancel();
    return { state: 'created', region };
  }
}
