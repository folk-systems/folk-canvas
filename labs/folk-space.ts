import { FolkElement, Matrix, Point, toDOMPrecision } from '@lib';
import { css } from '@lib/tags';

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

// Define the transform change callback type
export type TransformChangeCallback = (scale: number, position: Point) => void;

declare global {
  interface HTMLElementTagNameMap {
    'folk-space': FolkSpace;
  }
}

export class FolkSpace extends FolkElement {
  static tagName = 'folk-space';

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      touch-action: none;
      overscroll-behavior: none;
    }

    .space-content {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      transform-origin: 0 0;
      will-change: transform;
    }

    ::slotted(folk-shape) {
      position: absolute;
      z-index: 1;
    }

    .grid {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 0;
      --circle-width: 1px;
      --circle: circle at var(--circle-width) var(--circle-width);
      /* Map color transparency to scale for each level of the grid */
      --bg-color-1: rgba(0, 0, 0, 1);
      --bg-color-2: rgba(0, 0, 0, clamp(0, var(--scale), 1));
      --bg-color-3: rgba(0, 0, 0, clamp(0, calc(var(--scale) - 0.1), 1));
      --bg-color-4: rgba(0, 0, 0, clamp(0, calc(var(--scale) - 1), 1));
      --bg-color-5: rgba(0, 0, 0, clamp(0, calc(0.5 * var(--scale) - 2), 1));

      /* Draw points for each level of grid as set of a background image. First background is on top.*/
      background-image: radial-gradient(var(--circle), var(--bg-color-1) var(--circle-width), transparent 0),
        radial-gradient(var(--circle), var(--bg-color-2) var(--circle-width), transparent 0),
        radial-gradient(var(--circle), var(--bg-color-3) var(--circle-width), transparent 0),
        radial-gradient(var(--circle), var(--bg-color-4) var(--circle-width), transparent 0),
        radial-gradient(var(--circle), var(--bg-color-5) var(--circle-width), transparent 0);

      /* Each level of the grid should be a factor of --size. */
      --bg-size: calc(var(--size, 100px) / pow(2, 6) * var(--scale));

      /* Divide each part of grid into 4 sections. */
      --bg-size-1: calc(var(--bg-size) * pow(var(--sections, 4), 5));
      --bg-size-2: calc(var(--bg-size) * pow(var(--sections, 4), 4));
      --bg-size-3: calc(var(--bg-size) * pow(var(--sections, 4), 3));
      --bg-size-4: calc(var(--bg-size) * pow(var(--sections, 4), 2));
      --bg-size-5: calc(var(--bg-size) * var(--sections, 4));

      background-size:
        var(--bg-size-1) var(--bg-size-1),
        var(--bg-size-2) var(--bg-size-2),
        var(--bg-size-3) var(--bg-size-3),
        var(--bg-size-4) var(--bg-size-4),
        var(--bg-size-5) var(--bg-size-5);

      /* Pan each background position to each point in the underlay. */
      background-position: var(--x) var(--y);
    }
  `;

  #contentElement: HTMLElement;
  #gridElement: HTMLElement | null = null;
  #x = 0;
  #y = 0;
  #scale = 1;
  #minScale = MIN_SCALE;
  #maxScale = MAX_SCALE;
  #onTransformChange: TransformChangeCallback | null = null;

  constructor() {
    super();
    this.#contentElement = document.createElement('div');
    this.#contentElement.className = 'space-content';

    // Add a slot to ensure children are properly rendered
    const slot = document.createElement('slot');
    this.#contentElement.appendChild(slot);
  }

  get x(): number {
    return this.#x;
  }

  set x(value: number) {
    this.#x = value;
    this.#requestUpdate();
  }

  get y(): number {
    return this.#y;
  }

  set y(value: number) {
    this.#y = value;
    this.#requestUpdate();
  }

  get scale(): number {
    return this.#scale;
  }

  set scale(value: number) {
    this.#scale = value;
    this.#requestUpdate();
  }

  get minScale(): number {
    return this.#minScale;
  }

  set minScale(value: number) {
    this.#minScale = value;
    this.#requestUpdate();
  }

  get maxScale(): number {
    return this.#maxScale;
  }

  set maxScale(value: number) {
    this.#maxScale = value;
    this.#requestUpdate();
  }

  get position(): Point {
    return { x: this.#x, y: this.#y };
  }

  get matrix(): Matrix {
    return new Matrix().translate(this.#x, this.#y).scale(this.#scale, this.#scale);
  }

  get onTransformChange(): TransformChangeCallback | null {
    return this.#onTransformChange;
  }

  set onTransformChange(callback: TransformChangeCallback | null) {
    this.#onTransformChange = callback;
  }

  connectedCallback(): void {
    super.connectedCallback();

    // FolkElement (ReactiveElement) already creates a shadow root
    // So we don't need to create one, just access it
    const shadowRoot = this.shadowRoot;
    if (!shadowRoot) {
      console.error('Shadow root not found');
      return;
    }

    // Add content element to the shadow root
    shadowRoot.appendChild(this.#contentElement);

    // Create grid if needed
    this.#updateGrid();

    // Set up event listeners
    window.addEventListener('wheel', this.#onWheel, { passive: false });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('wheel', this.#onWheel);
  }

  #updateRequested = false;

  async #requestUpdate() {
    if (this.#updateRequested) return;

    this.#updateRequested = true;
    await true;
    this.#updateRequested = false;
    this.#update();
  }

  #update() {
    if (this.#contentElement) {
      this.#contentElement.style.transform = this.matrix.toCssString();
    }

    if (this.#gridElement) {
      this.#gridElement.style.setProperty('--scale', `${toDOMPrecision(this.scale)}`);
      this.#gridElement.style.setProperty('--x', `${toDOMPrecision(this.x)}px`);
      this.#gridElement.style.setProperty('--y', `${toDOMPrecision(this.y)}px`);
    }

    // Call the transform change callback if it exists
    if (this.#onTransformChange) {
      this.#onTransformChange(this.scale, this.position);
    }
  }

  #onWheel = (event: WheelEvent) => {
    // Check if the wheel event is happening inside this element
    if (!this.#isElementBeingScrolled(event)) return;

    event.preventDefault();

    const rect = this.getBoundingClientRect();
    const { clientX, clientY } = event;
    let { deltaX, deltaY } = event;

    if (event.deltaMode === 1) {
      // 1 is "lines", 0 is "pixels"
      // Firefox uses "lines" for some types of mouse
      deltaX *= 15;
      deltaY *= 15;
    }

    // ctrlKey is true when pinch-zooming on a trackpad.
    if (event.ctrlKey) {
      this.applyChange(0, 0, 1 - deltaY / 100, clientX - rect.left, clientY - rect.top);
    } else {
      this.applyChange(-1 * deltaX, -1 * deltaY, 1, clientX - rect.left, clientY - rect.top);
    }
  };

  /**
   * Check if the element is being scrolled
   */
  #isElementBeingScrolled(wheelEvent: WheelEvent): boolean {
    let el = wheelEvent.target as Element | null;

    while (el) {
      if (
        el === this &&
        this.offsetLeft < wheelEvent.clientX &&
        wheelEvent.clientX < this.offsetLeft + this.offsetWidth &&
        this.offsetTop < wheelEvent.clientY &&
        wheelEvent.clientY < this.offsetTop + this.offsetHeight
      )
        return true;

      if (el.scrollHeight > el.clientHeight) return false;

      el = el.parentElement;
    }

    return false;
  }

  /**
   * Apply changes to the matrix based on pan and zoom operations
   */
  applyChange(panX = 0, panY = 0, scaleDiff = 1, originX = 0, originY = 0) {
    // Calculate the new scale first
    const newScale = this.scale * scaleDiff;

    // Check if the new scale is within bounds
    if (newScale < this.#minScale || newScale > this.#maxScale) return;

    // Calculate new position that keeps the point under the cursor in the same position
    const x = originX - (originX - this.x) * scaleDiff + panX;
    const y = originY - (originY - this.y) * scaleDiff + panY;

    // Apply the new values
    this.scale = newScale;
    this.x = x;
    this.y = y;
  }

  /**
   * Reset the space to its initial state
   */
  reset(): void {
    this.x = 0;
    this.y = 0;
    this.scale = 1;
  }

  /**
   * Update the grid element
   */
  #updateGrid(): void {
    if (!this.shadowRoot) return;

    if (!this.#gridElement) {
      this.#gridElement = document.createElement('div');
      this.#gridElement.className = 'grid';
      this.shadowRoot.appendChild(this.#gridElement);
    }
    this.#gridElement.style.setProperty('--scale', `${toDOMPrecision(this.scale)}`);
    this.#gridElement.style.setProperty('--x', `${toDOMPrecision(this.x)}px`);
    this.#gridElement.style.setProperty('--y', `${toDOMPrecision(this.y)}px`);
  }
}

// Define the custom element
FolkSpace.define();
