import * as THREE from 'three';
import type { RegionShape } from '../map/MapTypes';
import type { TerrainData } from '../terrain/TerrainTypes';

type Point = { x: number; z: number };
const EPSILON = 1e-8;

function regionTriangles(shape: RegionShape): Point[][] {
  const points = shape.kind === 'rectangle'
    ? [
        { x: shape.center.x - shape.width / 2, z: shape.center.z - shape.depth / 2 },
        { x: shape.center.x + shape.width / 2, z: shape.center.z - shape.depth / 2 },
        { x: shape.center.x + shape.width / 2, z: shape.center.z + shape.depth / 2 },
        { x: shape.center.x - shape.width / 2, z: shape.center.z + shape.depth / 2 },
      ]
    : shape.points;
  if (points.length < 3) return [];
  const triangles = THREE.ShapeUtils.triangulateShape(points.map((point) => new THREE.Vector2(point.x, point.z)), []);
  return triangles.map((indices) => indices.map((index) => points[index]));
}

export function regionOutline(shape: RegionShape): Point[] {
  if (shape.kind === 'polygon') return shape.points;
  const { x, z } = shape.center;
  const dx = shape.width / 2; const dz = shape.depth / 2;
  return [{ x: x - dx, z: z - dz }, { x: x + dx, z: z - dz }, { x: x + dx, z: z + dz }, { x: x - dx, z: z + dz }];
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function clip(subject: Point[], triangle: Point[]): Point[] {
  let result = subject;
  const direction = cross(triangle[0], triangle[1], triangle[2]) >= 0 ? 1 : -1;
  for (let i = 0; i < 3 && result.length; i += 1) {
    const a = triangle[i]; const b = triangle[(i + 1) % 3];
    const input = result; result = [];
    for (let j = 0; j < input.length; j += 1) {
      const start = input[j]; const end = input[(j + 1) % input.length];
      const startSide = direction * cross(a, b, start);
      const endSide = direction * cross(a, b, end);
      if (startSide >= -EPSILON) result.push(start);
      if ((startSide < -EPSILON && endSide > EPSILON) || (startSide > EPSILON && endSide < -EPSILON)) {
        const t = startSide / (startSide - endSide);
        result.push({ x: start.x + t * (end.x - start.x), z: start.z + t * (end.z - start.z) });
      }
    }
  }
  return result;
}

function cellSupported(data: TerrainData, row: number, col: number): boolean {
  if (!data.sampleCoverage) return true;
  const index = row * data.cols + col;
  return data.sampleCoverage[index] === 1 && data.sampleCoverage[index + 1] === 1
    && data.sampleCoverage[index + data.cols] === 1 && data.sampleCoverage[index + data.cols + 1] === 1;
}

/** The PlaneGeometry uses the diagonal from the south-west to north-east vertex. */
export function sampleVisualHeight(data: TerrainData, x: number, z: number): number {
  const rawX = (x - data.origin.x) / data.width * (data.cols - 1);
  const rawZ = (z - data.origin.z) / data.depth * (data.rows - 1);
  if (rawX < -EPSILON || rawZ < -EPSILON || rawX > data.cols - 1 + EPSILON || rawZ > data.rows - 1 + EPSILON) return Number.NaN;
  const gx = THREE.MathUtils.clamp(rawX, 0, data.cols - 1);
  const gz = THREE.MathUtils.clamp(rawZ, 0, data.rows - 1);
  const col = Math.min(data.cols - 2, Math.floor(gx));
  const row = Math.min(data.rows - 2, Math.floor(gz));
  if (!cellSupported(data, row, col)) return Number.NaN;
  const tx = gx - col; const tz = gz - row;
  const i = row * data.cols + col;
  const nw = data.heights[i]; const ne = data.heights[i + 1];
  const sw = data.heights[i + data.cols]; const se = data.heights[i + data.cols + 1];
  return tx + tz <= 1
    ? nw * (1 - tx - tz) + ne * tx + sw * tz
    : se * (tx + tz - 1) + sw * (1 - tx) + ne * (1 - tz);
}

/** Clip the semantic polygon against the actual terrain triangles, retaining their exact height planes. */
export function buildTerrainRegionOverlay(
  shape: RegionShape, data: TerrainData, offset = 0.08,
  includeTriangle?: (x: number, z: number) => boolean,
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const dx = data.width / (data.cols - 1); const dz = data.depth / (data.rows - 1);
  for (const region of regionTriangles(shape)) {
    const minX = Math.min(...region.map((point) => point.x)); const maxX = Math.max(...region.map((point) => point.x));
    const minZ = Math.min(...region.map((point) => point.z)); const maxZ = Math.max(...region.map((point) => point.z));
    const firstCol = Math.max(0, Math.floor((minX - data.origin.x) / dx));
    const lastCol = Math.min(data.cols - 2, Math.floor((maxX - data.origin.x) / dx));
    const firstRow = Math.max(0, Math.floor((minZ - data.origin.z) / dz));
    const lastRow = Math.min(data.rows - 2, Math.floor((maxZ - data.origin.z) / dz));
    for (let row = firstRow; row <= lastRow; row += 1) for (let col = firstCol; col <= lastCol; col += 1) {
      if (!cellSupported(data, row, col)) continue;
      const x = data.origin.x + col * dx; const z = data.origin.z + row * dz;
      if (maxX < x || minX > x + dx || maxZ < z || minZ > z + dz) continue;
      const nw = { x, z }; const ne = { x: x + dx, z };
      const sw = { x, z: z + dz }; const se = { x: x + dx, z: z + dz };
      for (const ground of [[nw, sw, ne], [sw, se, ne]]) {
        const clipped = clip(region, ground);
        for (let i = 1; i < clipped.length - 1; i += 1) {
          if (Math.abs(cross(clipped[0], clipped[i], clipped[i + 1])) < EPSILON) continue;
          if (includeTriangle && !includeTriangle(
            (clipped[0].x + clipped[i].x + clipped[i + 1].x) / 3,
            (clipped[0].z + clipped[i].z + clipped[i + 1].z) / 3,
          )) continue;
          for (const point of [clipped[0], clipped[i], clipped[i + 1]]) {
            vertices.push(point.x, sampleVisualHeight(data, point.x, point.z) + offset, point.z);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

export function terrainLinePoints(data: TerrainData, points: readonly Point[], closed = false, offset = 0.16): THREE.Vector3[] {
  const line: THREE.Vector3[] = [];
  const count = closed ? points.length : points.length - 1;
  const step = Math.max(0.01, Math.min(data.width / (data.cols - 1), data.depth / (data.rows - 1)) / 2);
  for (let i = 0; i < count; i += 1) {
    const a = points[i]; const b = points[(i + 1) % points.length];
    const segments = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let j = i === 0 ? 0 : 1; j <= segments; j += 1) {
      const x = a.x + (b.x - a.x) * j / segments;
      const z = a.z + (b.z - a.z) * j / segments;
      const y = sampleVisualHeight(data, x, z);
      if (Number.isFinite(y)) line.push(new THREE.Vector3(x, y + offset, z));
    }
  }
  return line;
}
