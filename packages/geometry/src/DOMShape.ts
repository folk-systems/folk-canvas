import type { Matrix2D } from './Matrix2D.js';
import * as M from './Matrix2D.js';
import type { Vector2 } from './Vector2.js';

interface DOMShapeInit {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
  rotation?: number;
  transformOrigin?: Vector2;
}

/**
 * Represents a rectangle with position, size, and rotation,
 * capable of transforming points between local and parent coordinate spaces.
 *
 * **Coordinate System:**
 * - The origin `(0, 0)` is at the **top-left corner**.
 * - Positive `x` values extend **to the right**.
 * - Positive `y` values extend **downward**.
 * - Rotation is **clockwise**, in **radians**, around the rectangle's **center**.
 */
export class DOMShape implements DOMRect {
  #x: number; // X-coordinate of the top-left corner
  #y: number; // Y-coordinate of the top-left corner
  #width: number; // Width of the rectangle
  #height: number; // Height of the rectangle
  #rotation: number; // Rotation angle in radians, clockwise

  #transformOrigin: Vector2; // Origin for transformations

  #transformMatrix = M.fromIdentity(); // Transforms from local to parent space
  #inverseMatrix = M.fromIdentity(); // Transforms from parent to local space

  /**
   * Constructs a new `DOMShape`.
   * @param init - Optional initial values.
   */
  constructor(init: DOMShapeInit = {}) {
    this.#x = init.x ?? 0;
    this.#y = init.y ?? 0;
    this.#width = init.width ?? 0;
    this.#height = init.height ?? 0;
    this.#rotation = init.rotation ?? 0;

    // Initialize origins with relative values (0.5, 0.5 is center)
    this.#transformOrigin = init.transformOrigin ?? { x: 0.5, y: 0.5 };

    this.#updateMatrices();
  }

  // Getters and setters for properties

  /** Gets or sets the **x-coordinate** of the top-left corner. */
  get x(): number {
    return this.#x;
  }
  set x(value: number) {
    this.#x = value;
    this.#updateMatrices();
  }

  /** Gets or sets the **y-coordinate** of the top-left corner. */
  get y(): number {
    return this.#y;
  }
  set y(value: number) {
    this.#y = value;
    this.#updateMatrices();
  }

  /** Gets or sets the **width** of the rectangle. */
  get width(): number {
    return this.#width;
  }
  set width(value: number) {
    this.#width = value;
    this.#updateMatrices();
  }

  /** Gets or sets the **height** of the rectangle. */
  get height(): number {
    return this.#height;
  }
  set height(value: number) {
    this.#height = value;
    this.#updateMatrices();
  }

  /** Gets or sets the **rotation angle** in radians, **clockwise**. */
  get rotation(): number {
    return this.#rotation;
  }
  set rotation(value: number) {
    this.#rotation = value;
    this.#updateMatrices();
  }

  /** Gets or sets the **transform origin** as relative values (0 to 1). */
  get transformOrigin(): Vector2 {
    return this.#transformOrigin;
  }
  set transformOrigin(value: Vector2) {
    this.#transformOrigin = value;
    this.#updateMatrices();
  }

  // DOMRect read-only properties

  /** The **left** coordinate of the rectangle (same as `x`). */
  get left(): number {
    return this.x;
  }

  /** The **top** coordinate of the rectangle (same as `y`). */
  get top(): number {
    return this.y;
  }

  /** The **right** coordinate of the rectangle (`x + width`). */
  get right(): number {
    return this.x + this.width;
  }

  /** The **bottom** coordinate of the rectangle (`y + height`). */
  get bottom(): number {
    return this.y + this.height;
  }

  /**
   * Updates the transformation matrices based on the current position,
   * size, rotation, and origins of the rectangle.
   *
   * The transformation sequence is:
   * 1. **Translate** to the global position.
   * 2. **Translate** to the transform origin.
   * 3. **Rotate** around the rotation origin.
   * 4. **Translate** back from the transform origin.
   */
  #updateMatrices(rotationOrigin?: Vector2) {
    // Reset the transformMatrix to identity
    M.identitySelf(this.#transformMatrix);

    // Get absolute positions for origins
    const transformOriginX = this.#width * this.#transformOrigin.x;
    const transformOriginY = this.#height * this.#transformOrigin.y;
    const rotationOriginX = this.#width * (rotationOrigin?.x || 0.5);
    const rotationOriginY = this.#height * (rotationOrigin?.y || 0.5);

    // Apply transformations
    // Step 1: Translate to global position
    M.translateSelf(this.#transformMatrix, this.#x, this.#y);

    // Step 2: Translate to the transform origin
    M.translateSelf(this.#transformMatrix, transformOriginX, transformOriginY);

    // Step 3: Rotate around the rotation origin
    M.rotateSelf(this.#transformMatrix, this.#rotation, {
      x: rotationOriginX - transformOriginX,
      y: rotationOriginY - transformOriginY,
    });

    // Step 4: Translate back from the transform origin
    M.translateSelf(this.#transformMatrix, -transformOriginX, -transformOriginY);

    // Update inverseMatrix as the inverse of transformMatrix
    M.copy(this.#inverseMatrix, this.#transformMatrix);
    M.invertSelf(this.#inverseMatrix);
  }

  // Accessors for the transformation matrices
  get transformMatrix(): Matrix2D {
    return this.#transformMatrix;
  }

  get inverseMatrix(): Matrix2D {
    return this.#inverseMatrix;
  }

  /**
   * Converts a point from **parent space** to **local space**.
   * @param point - The point in parent coordinate space.
   * @returns The point in local coordinate space.
   */
  toLocalSpace(point: Vector2): Vector2 {
    return M.applyToPoint(this.#inverseMatrix, point);
  }

  /**
   * Converts a point from **local space** to **parent space**.
   * @param point - The point in local coordinate space.
   * @returns The point in parent coordinate space.
   */
  toParentSpace(point: Vector2): Vector2 {
    return M.applyToPoint(this.#transformMatrix, point);
  }

  // Local space corners

  /**
   * Gets the **top-left** corner of the rectangle in **local space** (before transformation).
   */
  get topLeft(): Vector2 {
    return { x: 0, y: 0 };
  }

  /**
   * Gets the **top-right** corner of the rectangle in **local space** (before transformation).
   */
  get topRight(): Vector2 {
    return { x: this.width, y: 0 };
  }

  /**
   * Gets the **bottom-right** corner of the rectangle in **local space** (before transformation).
   */
  get bottomRight(): Vector2 {
    return { x: this.width, y: this.height };
  }

  /**
   * Gets the **bottom-left** corner of the rectangle in **local space** (before transformation).
   */
  get bottomLeft(): Vector2 {
    return { x: 0, y: this.height };
  }

  /**
   * Gets the **center point** of the rectangle in **parent space**.
   */
  get center(): Vector2 {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
    };
  }

  /**
   * Gets the four corner vertices of the rectangle in **local space**.
   * @returns An array of points in the order: top-left, top-right, bottom-right, bottom-left.
   */
  get vertices(): Vector2[] {
    return [this.topLeft, this.topRight, this.bottomRight, this.bottomLeft];
  }

  /**
   * Generates a CSS transform string representing the rectangle's transformation.
   * @returns A string suitable for use in CSS `transform` properties.
   */
  toCssString(): string {
    return M.toCSSString(this.transformMatrix);
  }

  /**
   * Converts the rectangle's properties to a JSON serializable object.
   * @returns An object containing the rectangle's `x`, `y`, `width`, `height`, and `rotation`.
   */
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
    };
  }

  // TODO: these setters work but surely there's a better way

  /**
   * Sets the **top-left** corner of the rectangle in **local space**, adjusting the position, width, and height accordingly,
   * and keeps the **bottom-right corner** fixed in the **parent space**.
   * @param point - The new top-left corner point in local coordinate space.
   */
  set topLeft(point: Vector2) {
    // Compute the parent-space position of the bottom-right corner before resizing
    const bottomRightBefore = this.toParentSpace(this.bottomRight);

    // Update x, y, width, and height
    const deltaWidth = this.#width - point.x;
    const deltaHeight = this.#height - point.y;

    this.#x += point.x;
    this.#y += point.y;
    this.#width = deltaWidth;
    this.#height = deltaHeight;

    // Update transformation matrices after changing size and position
    this.#updateMatrices();

    // Compute the parent-space position of the bottom-right corner after resizing
    const bottomRightAfter = this.toParentSpace(this.bottomRight);

    // Compute the difference in position
    const deltaX = bottomRightAfter.x - bottomRightBefore.x;
    const deltaY = bottomRightAfter.y - bottomRightBefore.y;

    // Adjust x and y to compensate for the movement
    this.#x -= deltaX;
    this.#y -= deltaY;

    // Update matrices again after adjusting position
    this.#updateMatrices();
  }

  /**
   * Sets the **top-right** corner of the rectangle in **local space**, adjusting the position, width, and height accordingly,
   * and keeps the **bottom-left corner** fixed in the **parent space**.
   * @param point - The new top-right corner point in local coordinate space.
   */
  set topRight(point: Vector2) {
    // Compute the parent-space position of the bottom-left corner before resizing
    const bottomLeftBefore = this.toParentSpace(this.bottomLeft);

    // Update y, width, and height
    const deltaWidth = point.x;
    const deltaHeight = this.#height - point.y;

    this.#y += point.y;
    this.#width = deltaWidth;
    this.#height = deltaHeight;

    // Update transformation matrices after changing size and position
    this.#updateMatrices();

    // Compute the parent-space position of the bottom-left corner after resizing
    const bottomLeftAfter = this.toParentSpace(this.bottomLeft);

    // Compute the difference in position
    const deltaX = bottomLeftAfter.x - bottomLeftBefore.x;
    const deltaY = bottomLeftAfter.y - bottomLeftBefore.y;

    // Adjust x and y to compensate for the movement
    this.#x -= deltaX;
    this.#y -= deltaY;

    // Update matrices again after adjusting position
    this.#updateMatrices();
  }

  /**
   * Sets the **bottom-right** corner of the rectangle in **local space**, adjusting the width and height accordingly,
   * and keeps the **top-left corner** fixed in the **parent space**.
   * @param point - The new bottom-right corner point in local coordinate space.
   */
  set bottomRight(point: Vector2) {
    // Compute the parent-space position of the top-left corner before resizing
    const topLeftBefore = this.toParentSpace(this.topLeft);

    // Update width and height
    this.#width = point.x;
    this.#height = point.y;

    // Update transformation matrices after changing size
    this.#updateMatrices();

    // Compute the parent-space position of the top-left corner after resizing
    const topLeftAfter = this.toParentSpace(this.topLeft);

    // Compute the difference in position
    const deltaX = topLeftAfter.x - topLeftBefore.x;
    const deltaY = topLeftAfter.y - topLeftBefore.y;

    // Adjust x and y to compensate for the movement
    this.#x -= deltaX;
    this.#y -= deltaY;

    // Update matrices again after adjusting position
    this.#updateMatrices();
  }

  /**
   * Sets the **bottom-left** corner of the rectangle in **local space**, adjusting the position, width, and height accordingly,
   * and keeps the **top-right corner** fixed in the **parent space**.
   * @param point - The new bottom-left corner point in local coordinate space.
   */
  set bottomLeft(point: Vector2) {
    // Compute the parent-space position of the top-right corner before resizing
    const topRightBefore = this.toParentSpace(this.topRight);

    // Update x, width, and height
    const deltaWidth = this.#width - point.x;
    const deltaHeight = point.y;

    this.#x += point.x;
    this.#width = deltaWidth;
    this.#height = deltaHeight;

    // Update transformation matrices after changing size and position
    this.#updateMatrices();

    // Compute the parent-space position of the top-right corner after resizing
    const topRightAfter = this.toParentSpace(this.topRight);

    // Compute the difference in position
    const deltaX = topRightAfter.x - topRightBefore.x;
    const deltaY = topRightAfter.y - topRightBefore.y;

    // Adjust x and y to compensate for the movement
    this.#x -= deltaX;
    this.#y -= deltaY;

    // Update matrices again after adjusting position
    this.#updateMatrices();
  }

  /**
   * Computes the **axis-aligned bounding box** of the transformed rectangle in **parent space**.
   * @returns An object representing the bounding rectangle with properties: `x`, `y`, `width`, `height`.
   */
  get bounds(): Required<DOMRectInit> {
    // Transform all vertices to parent space
    const transformedVertices = this.vertices.map((v) => this.toParentSpace(v));

    // Find min and max coordinates
    const xs = transformedVertices.map((v) => v.x);
    const ys = transformedVertices.map((v) => v.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   *
   * @param angle The rotation angle in radians, **clockwise**.
   * @param origin The origin to rotate the shape around in parent space.
   */
  rotate(angle: number, origin: Vector2) {
    origin = this.toLocalSpace(origin);
    this.#rotation = angle;
    this.#updateMatrices({
      x: origin.x / this.#width,
      y: origin.y / this.height,
    });
  }
}

/**
 * A **read-only** version of `DOMShape` that prevents modification of position,
 * size, and rotation properties.
 */
export class DOMShapeReadonly extends DOMShape {
  constructor(init: DOMShapeInit = {}) {
    super(init);
  }

  // Explicit overrides for all getters from parent class
  override get x(): number {
    return super.x;
  }

  override get y(): number {
    return super.y;
  }

  override get width(): number {
    return super.width;
  }

  override get height(): number {
    return super.height;
  }

  override get rotation(): number {
    return super.rotation;
  }

  override get left(): number {
    return super.left;
  }

  override get top(): number {
    return super.top;
  }

  override get right(): number {
    return super.right;
  }

  override get bottom(): number {
    return super.bottom;
  }

  override get transformMatrix(): Matrix2D {
    return super.transformMatrix;
  }

  override get inverseMatrix(): Matrix2D {
    return super.inverseMatrix;
  }

  override get topLeft(): Vector2 {
    return super.topLeft;
  }

  override get topRight(): Vector2 {
    return super.topRight;
  }

  override get bottomRight(): Vector2 {
    return super.bottomRight;
  }

  override get bottomLeft(): Vector2 {
    return super.bottomLeft;
  }

  override get center(): Vector2 {
    return super.center;
  }

  // Add no-op setters
  override set x(value: number) {
    // no-op
  }

  override set y(value: number) {
    // no-op
  }

  override set width(value: number) {
    // no-op
  }

  override set height(value: number) {
    // no-op
  }

  override set rotation(value: number) {
    // no-op
  }
}
