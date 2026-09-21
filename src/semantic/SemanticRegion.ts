import type { SemanticRegionData } from '../map/MapTypes';

export class SemanticRegion implements SemanticRegionData {
  id: SemanticRegionData['id'];
  type: SemanticRegionData['type'];
  walkable: SemanticRegionData['walkable'];
  movementCost: SemanticRegionData['movementCost'];
  shape: SemanticRegionData['shape'];
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(data: SemanticRegionData) {
    this.id = data.id;
    this.type = data.type;
    this.walkable = data.walkable;
    this.movementCost = data.movementCost;
    this.shape = data.shape;
    if (data.shape.kind === 'rectangle') {
      this.bounds = {
        minX: data.shape.center.x - data.shape.width / 2,
        maxX: data.shape.center.x + data.shape.width / 2,
        minZ: data.shape.center.z - data.shape.depth / 2,
        maxZ: data.shape.center.z + data.shape.depth / 2,
      };
    } else {
      this.bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      for (const point of data.shape.points) {
        this.bounds.minX = Math.min(this.bounds.minX, point.x);
        this.bounds.maxX = Math.max(this.bounds.maxX, point.x);
        this.bounds.minZ = Math.min(this.bounds.minZ, point.z);
        this.bounds.maxZ = Math.max(this.bounds.maxZ, point.z);
      }
    }
  }

  contains(x: number, z: number): boolean {
    if (this.shape.kind === 'rectangle') {
      return (
        Math.abs(x - this.shape.center.x) <= this.shape.width / 2 &&
        Math.abs(z - this.shape.center.z) <= this.shape.depth / 2
      );
    }

    let inside = false;
    const points = this.shape.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i];
      const b = points[j];
      const edge = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
      if (Math.abs(edge) < 1e-8 && x >= Math.min(a.x, b.x) - 1e-8 && x <= Math.max(a.x, b.x) + 1e-8
        && z >= Math.min(a.z, b.z) - 1e-8 && z <= Math.max(a.z, b.z) + 1e-8) return true;
      const intersects = a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  getBounds(): Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }> { return this.bounds; }

  intersectsSegment(start: { x: number; z: number }, end: { x: number; z: number }): boolean {
    if (Math.max(start.x, end.x) < this.bounds.minX || Math.min(start.x, end.x) > this.bounds.maxX ||
      Math.max(start.z, end.z) < this.bounds.minZ || Math.min(start.z, end.z) > this.bounds.maxZ) return false;
    let points: Array<{ x: number; z: number }>;
    if (this.shape.kind === 'polygon') {
      points = this.shape.points;
      if (points.length < 3) return false;
    } else {
      const { x, z } = this.shape.center;
      const halfWidth = this.shape.width / 2;
      const halfDepth = this.shape.depth / 2;
      points = [
        { x: x - halfWidth, z: z - halfDepth },
        { x: x + halfWidth, z: z - halfDepth },
        { x: x + halfWidth, z: z + halfDepth },
        { x: x - halfWidth, z: z + halfDepth },
      ];
    }
    if (this.contains(start.x, start.z) || this.contains(end.x, end.z)) return true;
    for (let i = 0; i < points.length; i += 1) {
      if (segmentsIntersect(start, end, points[i], points[(i + 1) % points.length])) return true;
    }
    return false;
  }
}

function segmentsIntersect(
  a: { x: number; z: number }, b: { x: number; z: number },
  c: { x: number; z: number }, d: { x: number; z: number },
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function cross(p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }): number {
  return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
}

function onSegment(p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }): boolean {
  return Math.abs(cross(p, q, r)) <= 1e-8 &&
    r.x >= Math.min(p.x, q.x) - 1e-8 && r.x <= Math.max(p.x, q.x) + 1e-8 &&
    r.z >= Math.min(p.z, q.z) - 1e-8 && r.z <= Math.max(p.z, q.z) + 1e-8;
}
