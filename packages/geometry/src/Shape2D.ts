import type { Matrix2D } from './Matrix2D.js';
import { sign } from './utilities.js';
import type { Vector2, Vector2Readonly } from './Vector2.js';
import * as V from './Vector2.js';

export interface Rect2D {
  x: number;
  y: number;
  height: number;
  width: number;
}

export type Shape2D = Rect2D & {
  rotation: number;
};

export type Shape2DReadonly = Readonly<Shape2D>;

export type Shape2DBounds = Readonly<
  Rect2D & {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }
>;

export type Shape2DCorners = Readonly<{
  topLeft: Vector2Readonly;
  topRight: Vector2Readonly;
  bottomRight: Vector2Readonly;
  bottomLeft: Vector2Readonly;
}>;

export function fromValues(x = 0, y = 0, width = 0, height = 0, rotation = 0): Shape2D {
  return { x, y, width, height, rotation };
}

export function clone({ x, y, width, height, rotation }: Shape2D): Shape2D {
  return { x, y, width, height, rotation };
}

export function center(shape: Shape2DReadonly): Vector2Readonly {
  return {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2,
  };
}

export function topLeftCorner(shape: Shape2DReadonly, c = center(shape)) {
  return V.rotateAround({ x: shape.x, y: shape.y }, c, shape.rotation);
}

export function topRightCorner(shape: Shape2DReadonly, c = center(shape)) {
  return V.rotateAround({ x: shape.x + shape.width, y: shape.y }, c, shape.rotation);
}

export function bottomRightCorner(shape: Shape2DReadonly, c = center(shape)) {
  return V.rotateAround({ x: shape.x + shape.width, y: shape.y + shape.height }, c, shape.rotation);
}

export function bottomLeftCorner(shape: Shape2DReadonly, c = center(shape)) {
  return V.rotateAround({ x: shape.x, y: shape.y + shape.height }, c, shape.rotation);
}

export function corners(shape: Shape2DReadonly, c = center(shape)): Shape2DCorners {
  return {
    topLeft: topLeftCorner(shape, c),
    topRight: topRightCorner(shape, c),
    bottomRight: bottomRightCorner(shape, c),
    bottomLeft: bottomLeftCorner(shape, c),
  };
}

function updateTopLeftAndBottomRightCorners(shape: Shape2D, topLeft: Vector2Readonly, bottomRight: Vector2Readonly) {
  const newCenter = {
    x: (topLeft.x + bottomRight.x) / 2,
    y: (topLeft.y + bottomRight.y) / 2,
  };

  // Undo shape rotation
  const newTopLeft = V.rotateAround(topLeft, newCenter, -shape.rotation);
  const newBottomRight = V.rotateAround(bottomRight, newCenter, -shape.rotation);

  shape.x = newTopLeft.x;
  shape.y = newTopLeft.y;
  shape.width = newBottomRight.x - newTopLeft.x;
  shape.height = newBottomRight.y - newTopLeft.y;
}

function updateTopRightAndBottomLeftCorners(shape: Shape2D, topRight: Vector2Readonly, bottomLeft: Vector2Readonly) {
  const newCenter = {
    x: (bottomLeft.x + topRight.x) / 2,
    y: (bottomLeft.y + topRight.y) / 2,
  };

  // Undo shape rotations
  const newTopRight = V.rotateAround(topRight, newCenter, -shape.rotation);
  const newBottomLeft = V.rotateAround(bottomLeft, newCenter, -shape.rotation);

  shape.x = newBottomLeft.x;
  shape.y = newTopRight.y;
  shape.width = newTopRight.x - newBottomLeft.x;
  shape.height = newBottomLeft.y - newTopRight.y;
}

export function setTopLeftCorner(shape: Shape2D, topLeft: Vector2Readonly) {
  return updateTopLeftAndBottomRightCorners(shape, topLeft, bottomRightCorner(shape));
}

export function setTopRightCorner(shape: Shape2D, topRight: Vector2Readonly) {
  updateTopRightAndBottomLeftCorners(shape, topRight, bottomLeftCorner(shape));
}

export function setBottomRightCorner(shape: Shape2D, bottomRight: Vector2Readonly) {
  return updateTopLeftAndBottomRightCorners(shape, topLeftCorner(shape), bottomRight);
}

export function setBottomLeftCorner(shape: Shape2D, bottomLeft: Vector2Readonly) {
  updateTopRightAndBottomLeftCorners(shape, topRightCorner(shape), bottomLeft);
}

export function rotateAround(shape: Shape2D, angle: number, origin: Vector2Readonly) {
  const { topLeft, bottomRight } = corners(shape);
  const newTopLeft = V.rotateAround(topLeft, origin, angle);
  const newBottomRight = V.rotateAround(bottomRight, origin, angle);
  shape.rotation = angle;
  updateTopLeftAndBottomRightCorners(shape, newTopLeft, newBottomRight);
}

export function bounds(
  shape: Shape2DReadonly,
  { topLeft, topRight, bottomRight, bottomLeft } = corners(shape),
): Shape2DBounds {
  const x = shape.x;
  const y = shape.y;
  const height =
    Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y) -
    Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
  const width =
    Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x) -
    Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);

  return {
    x,
    y,
    height,
    width,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
  };
}
