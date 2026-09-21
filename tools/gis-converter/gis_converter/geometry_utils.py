"""Small dependency-free geometry helpers for validation, clipping and densifying."""

from __future__ import annotations

import math
from typing import Callable, Iterable

Point = tuple[float, float]
Bounds = tuple[float, float, float, float]


def finite_point(point: Point) -> bool:
    return len(point) >= 2 and math.isfinite(float(point[0])) and math.isfinite(float(point[1]))


def clean_line(points: Iterable[Point]) -> list[Point]:
    result: list[Point] = []
    for value in points:
        point = (float(value[0]), float(value[1]))
        if not finite_point(point):
            return []
        if not result or math.hypot(point[0] - result[-1][0], point[1] - result[-1][1]) > 1e-8:
            result.append(point)
    return result


def clean_ring(points: Iterable[Point]) -> list[Point]:
    result = clean_line(points)
    if len(result) > 1 and math.hypot(result[0][0] - result[-1][0], result[0][1] - result[-1][1]) <= 1e-8:
        result.pop()
    if len(result) >= 3:
        result.append(result[0])
    return result


def ring_area(ring: list[Point]) -> float:
    return 0.5 * sum(ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
                     for index in range(max(0, len(ring) - 1)))


def ring_self_intersects(ring: list[Point]) -> bool:
    edge_count = len(ring) - 1
    for i in range(edge_count):
        for j in range(i + 1, edge_count):
            if abs(i - j) <= 1 or (i == 0 and j == edge_count - 1):
                continue
            if _segments_intersect(ring[i], ring[i + 1], ring[j], ring[j + 1]):
                return True
    return False


def clip_ring_to_bounds(ring: list[Point], bounds: Bounds) -> list[Point]:
    points = clean_ring(ring)
    if len(points) < 4:
        return []
    polygon = points[:-1]
    min_x, min_z, max_x, max_z = bounds
    edges: list[tuple[Callable[[Point], bool], Callable[[Point, Point], Point]]] = [
        (lambda p: p[0] >= min_x, lambda a, b: _intersection_at_x(a, b, min_x)),
        (lambda p: p[0] <= max_x, lambda a, b: _intersection_at_x(a, b, max_x)),
        (lambda p: p[1] >= min_z, lambda a, b: _intersection_at_z(a, b, min_z)),
        (lambda p: p[1] <= max_z, lambda a, b: _intersection_at_z(a, b, max_z)),
    ]
    for inside, intersection in edges:
        if not polygon:
            break
        output: list[Point] = []
        previous = polygon[-1]
        previous_inside = inside(previous)
        for current in polygon:
            current_inside = inside(current)
            if current_inside:
                if not previous_inside:
                    output.append(intersection(previous, current))
                output.append(current)
            elif previous_inside:
                output.append(intersection(previous, current))
            previous, previous_inside = current, current_inside
        polygon = output
    clipped = clean_ring(polygon)
    return clipped if len(clipped) >= 4 and abs(ring_area(clipped)) > 1e-6 else []


def clip_polyline_to_bounds(points: list[Point], bounds: Bounds) -> list[list[Point]]:
    clean = clean_line(points)
    if len(clean) < 2:
        return []
    parts: list[list[Point]] = []
    current: list[Point] = []
    for index in range(len(clean) - 1):
        clipped = _clip_segment(clean[index], clean[index + 1], bounds)
        if clipped is None:
            if len(current) >= 2:
                parts.append(current)
            current = []
            continue
        start, end = clipped
        if current and _close(current[-1], start):
            if not _close(current[-1], end):
                current.append(end)
        else:
            if len(current) >= 2:
                parts.append(current)
            current = [start, end]
    if len(current) >= 2:
        parts.append(current)
    return parts


def densify_line(points: list[Point], max_segment_length: float) -> list[Point]:
    if len(points) < 2 or max_segment_length <= 0:
        return points
    result = [points[0]]
    for start, end in zip(points, points[1:]):
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        steps = max(1, math.ceil(length / max_segment_length))
        for step in range(1, steps + 1):
            t = step / steps
            result.append((start[0] + (end[0] - start[0]) * t,
                           start[1] + (end[1] - start[1]) * t))
    return clean_line(result)


def bounds_intersect(points: list[Point], bounds: Bounds) -> bool:
    if not points:
        return False
    min_x, min_z, max_x, max_z = bounds
    xs = [point[0] for point in points]
    zs = [point[1] for point in points]
    return max(xs) >= min_x and min(xs) <= max_x and max(zs) >= min_z and min(zs) <= max_z


def _intersection_at_x(a: Point, b: Point, x: float) -> Point:
    if abs(b[0] - a[0]) < 1e-12:
        return x, a[1]
    t = (x - a[0]) / (b[0] - a[0])
    return x, a[1] + (b[1] - a[1]) * t


def _intersection_at_z(a: Point, b: Point, z: float) -> Point:
    if abs(b[1] - a[1]) < 1e-12:
        return a[0], z
    t = (z - a[1]) / (b[1] - a[1])
    return a[0] + (b[0] - a[0]) * t, z


def _clip_segment(a: Point, b: Point, bounds: Bounds) -> tuple[Point, Point] | None:
    min_x, min_z, max_x, max_z = bounds
    dx, dz = b[0] - a[0], b[1] - a[1]
    p = (-dx, dx, -dz, dz)
    q = (a[0] - min_x, max_x - a[0], a[1] - min_z, max_z - a[1])
    t0, t1 = 0.0, 1.0
    for pi, qi in zip(p, q):
        if abs(pi) < 1e-12:
            if qi < 0:
                return None
            continue
        t = qi / pi
        if pi < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return None
    return ((a[0] + dx * t0, a[1] + dz * t0),
            (a[0] + dx * t1, a[1] + dz * t1))


def _cross(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _segments_intersect(a: Point, b: Point, c: Point, d: Point) -> bool:
    ac, ad, ca, cb = _cross(a, b, c), _cross(a, b, d), _cross(c, d, a), _cross(c, d, b)
    return ac * ad < -1e-12 and ca * cb < -1e-12


def _close(a: Point, b: Point) -> bool:
    return math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-7
