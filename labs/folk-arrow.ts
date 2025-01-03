import { getSvgPathFromStroke, pointsOnBezierCurves } from '@lib/utils';
import { PropertyValues } from '@lit/reactive-element';
import { getBoxToBoxArrow } from 'perfect-arrows';
import { getStroke, StrokeOptions } from 'perfect-freehand';
import { FolkBaseConnection } from './folk-base-connection.ts';

export type Arrow = [
  /** The x position of the (padded) starting point. */
  sx: number,
  /** The y position of the (padded) starting point. */
  sy: number,
  /** The x position of the control point. */
  cx: number,
  /** The y position of the control point. */
  cy: number,
  /** The x position of the (padded) ending point. */
  ex: number,
  /** The y position of the (padded) ending point. */
  ey: number,
  /** The angle (in radians) for an ending arrowhead. */
  ae: number,
  /** The angle (in radians) for a starting arrowhead. */
  as: number,
  /** The angle (in radians) for a center arrowhead. */
  ac: number,
];

declare global {
  interface HTMLElementTagNameMap {
    'folk-arrow': FolkArrow;
  }
}

export class FolkArrow extends FolkBaseConnection {
  static override tagName = 'folk-arrow';

  #options: StrokeOptions = {
    size: 7,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
    // TODO: figure out how to expose these as attributes
    easing: (t) => t,
    start: {
      taper: 50,
      easing: (t) => t,
      cap: true,
    },
    end: {
      taper: 0,
      easing: (t) => t,
      cap: true,
    },
  };

  override update(changedProperties: PropertyValues<this>) {
    super.update(changedProperties);

    const { sourceRect, targetRect } = this;

    if (sourceRect === null || targetRect === null) {
      this.style.clipPath = '';
      this.style.display = 'none';
      return;
    }

    this.style.display = '';

    const [sx, sy, cx, cy, ex, ey] = getBoxToBoxArrow(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      targetRect.x,
      targetRect.y,
      targetRect.width,
      targetRect.height,
    ) as Arrow;

    const points = pointsOnBezierCurves([
      { x: sx, y: sy },
      { x: cx, y: cy },
      { x: ex, y: ey },
      { x: ex, y: ey },
    ]);

    const stroke = getStroke(points, this.#options);
    const path = getSvgPathFromStroke(stroke);
    this.style.clipPath = `path('${path}')`;
    this.style.backgroundColor = 'black';
  }
}
