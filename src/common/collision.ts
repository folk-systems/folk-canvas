import { TransformDOMRect } from './TransformDOMRect';
import { Point } from './types';

const sign = (value: number): -1 | 1 => (value < 0 ? -1 : 1);

export class Hit {
  /** The point of contact between the two objects. */
  pos: Point = { x: 0, y: 0 };

  /** The a vector representing the overlap between the two objects. */
  delta: Point = { x: 0, y: 0 };

  /** The surface normal at the point of contact. */
  normal: Point = { x: 0, y: 0 };
}

/** Test collisions of axis-aligned bounding boxes. */
export function aabbHitDetection(rect1: DOMRect, rect2: DOMRect, proximity = 0): Hit | null {
  const dx = rect2.x - rect1.x;
  const px = rect2.width / 2 + rect1.width / 2 - Math.abs(dx);

  if (px <= 0) return null;

  const dy = rect2.y - rect1.y;
  const py = rect2.height / 2 + rect1.height / 2 - Math.abs(dy);

  if (py <= 0) return null;

  const hit = new Hit();

  if (px < py) {
    const sx = sign(dx);
    hit.delta.x = px * sx;
    hit.normal.x = sx;
    hit.pos.x = rect1.x + (rect1.width / 2) * sx;
    hit.pos.y = rect2.y;
  } else {
    const sy = sign(dy);
    hit.delta.y = py * sy;
    hit.normal.y = sy;
    hit.pos.x = rect2.x;
    hit.pos.y = rect1.y + (rect1.height / 2) * sy;
  }

  return hit;
}

export function aabbIntersection(rect1: DOMRect, rect2: DOMRect, proximity = 0) {
  return (
    rect1.left - rect2.right < proximity &&
    rect2.left - rect1.right < proximity &&
    rect1.top - rect2.bottom < proximity &&
    rect2.top - rect1.bottom < proximity
  );
}

export function collisionDetection(rect1: TransformDOMRect, rect2: TransformDOMRect) {
  // Performance optimization to test if
  if (!aabbIntersection(rect1, rect2)) return false;
}
