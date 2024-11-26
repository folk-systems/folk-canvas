import { FolkGeometry } from '../canvas/fc-geometry';
import { Vertex } from './utils';
import { ClientRectObserverEntry, ClientRectObserverManager } from './visual-observer';

const clientRectObserver = new ClientRectObserverManager();

const vertexRegex = /(?<x>-?([0-9]*[.])?[0-9]+),\s*(?<y>-?([0-9]*[.])?[0-9]+)/;

function parseVertex(str: string): Vertex | null {
  const results = vertexRegex.exec(str);

  if (results === null) return null;

  return {
    x: Number(results.groups?.x),
    y: Number(results.groups?.y),
  };
}

function parseCSSSelector(selector: string): string[] {
  return selector.split('>>>').map((s) => s.trim());
}

export class AbstractArrow extends HTMLElement {
  static tagName = 'abstract-arrow';

  static register() {
    customElements.define(this.tagName, this);
  }

  #source = '';
  /** A CSS selector for the source of the arrow. */
  get source() {
    return this.#source;
  }

  set source(source) {
    this.#source = source;
    this.observeSource();
  }

  #sourceRect: DOMRectReadOnly | undefined;
  get sourceRect() {
    return this.#sourceRect;
  }

  #sourceElement: Element | null = null;

  get sourceElement() {
    return this.#sourceElement;
  }

  #sourceCallback = (entry: ClientRectObserverEntry) => {
    this.#sourceRect = entry.contentRect;
    this.#update();
  };

  #sourceHandler = (e: Event) => {
    const geometry = e.target as FolkGeometry;
    this.#sourceRect = geometry.getClientRect();
    this.#update();
  };

  #sourceIframeSelector = '';
  #sourceIframeRect = DOMRectReadOnly.fromRect();
  #sourceIframeChildRect = DOMRectReadOnly.fromRect();

  #sourcePostMessage = (event: MessageEvent) => {
    const iframe = this.#sourceElement as HTMLIFrameElement;

    if (event.source !== iframe.contentWindow) return;

    switch (event.data.type) {
      case 'folk-iframe-ready': {
        event.source?.postMessage({
          type: 'folk-observe-element',
          selector: this.#sourceIframeSelector,
        });
        return;
      }
      case 'folk-element-change': {
        if (this.#sourceIframeSelector === event.data.selector) {
          this.#sourceIframeChildRect = event.data.boundingBox;
          this.#updateSourceIframeRect();
        }
        return;
      }
    }
  };

  #sourceIframeCallback = (entry: ClientRectObserverEntry) => {
    this.#sourceIframeRect = entry.contentRect;
    this.#updateSourceIframeRect();
  };

  #updateSourceIframeRect() {
    this.#sourceRect = DOMRectReadOnly.fromRect({
      x: this.#sourceIframeRect.x + this.#sourceIframeChildRect.x,
      y: this.#sourceIframeRect.y + this.#sourceIframeChildRect.y,
      height: this.#sourceIframeChildRect.height,
      width: this.#sourceIframeChildRect.width,
    });

    this.#update();
  }

  #target = '';
  /** A CSS selector for the target of the arrow. */
  get target() {
    return this.#target;
  }
  set target(target) {
    this.#target = target;
    this.observeTarget();
  }

  #targetRect: DOMRectReadOnly | undefined;
  get targetRect() {
    return this.#targetRect;
  }

  #targetElement: Element | null = null;
  get targetElement() {
    return this.#targetElement;
  }

  #targetCallback = (entry: ClientRectObserverEntry) => {
    this.#targetRect = entry.contentRect;
    this.#update();
  };

  #targetHandler = (e: Event) => {
    const geometry = e.target as FolkGeometry;
    this.#targetRect = geometry.getClientRect();
    this.#update();
  };

  #targetIframeSelector = '';
  #targetIframeRect = DOMRectReadOnly.fromRect();
  #targetIframeChildRect = DOMRectReadOnly.fromRect();

  #targetPostMessage = (event: MessageEvent) => {
    const iframe = this.#targetElement as HTMLIFrameElement;

    if (event.source !== iframe.contentWindow) return;

    switch (event.data.type) {
      case 'folk-iframe-ready': {
        event.source?.postMessage({
          type: 'folk-observe-element',
          selector: this.#targetIframeSelector,
        });
        return;
      }
      case 'folk-element-change': {
        if (this.#targetIframeSelector === event.data.selector) {
          this.#targetIframeChildRect = event.data.boundingBox;
          this.#updateTargetIframeRect();
        }
        return;
      }
    }
  };

  #targetIframeCallback = (entry: ClientRectObserverEntry) => {
    this.#targetIframeRect = entry.contentRect;
    this.#updateTargetIframeRect();
  };

  #updateTargetIframeRect() {
    this.#targetRect = DOMRectReadOnly.fromRect({
      x: this.#targetIframeRect.x + this.#targetIframeChildRect.x,
      y: this.#targetIframeRect.y + this.#targetIframeChildRect.y,
      height: this.#targetIframeChildRect.height,
      width: this.#targetIframeChildRect.width,
    });

    this.#update();
  }

  connectedCallback() {
    this.source = this.getAttribute('source') || this.#source;
    this.target = this.getAttribute('target') || this.#target;
  }

  disconnectedCallback() {
    this.unobserveSource();
    this.unobserveTarget();
  }

  // TODO: why reparse the vertex?
  setSourceVertex(vertex: Vertex) {
    this.target = `${vertex.x},${vertex.y}`;
  }

  observeSource() {
    this.unobserveSource();

    const vertex = parseVertex(this.#source);

    if (vertex) {
      this.#sourceRect = DOMRectReadOnly.fromRect(vertex);
      this.#update();
    } else {
      const [selector, iframeSelector] = parseCSSSelector(this.#source);
      this.#sourceIframeSelector = iframeSelector;
      this.#sourceElement = document.querySelector(selector);

      if (this.#sourceElement === null) {
        throw new Error('source is not a valid element');
      } else if (this.#sourceElement instanceof FolkGeometry) {
        this.#sourceElement.addEventListener('resize', this.#sourceHandler);
        this.#sourceElement.addEventListener('move', this.#sourceHandler);
        this.#sourceRect = this.#sourceElement.getBoundingClientRect();
      } else if (this.#sourceElement instanceof HTMLIFrameElement && this.#sourceIframeSelector) {
        window.addEventListener('message', this.#sourcePostMessage);
        clientRectObserver.observe(this.#sourceElement, this.#sourceIframeCallback);
        this.#sourceElement.contentWindow?.postMessage({
          type: 'folk-observe-element',
          selector: this.#sourceIframeSelector,
        });
      } else {
        clientRectObserver.observe(this.#sourceElement, this.#sourceCallback);
        this.#sourceRect = this.#sourceElement.getBoundingClientRect();
      }
    }
  }

  unobserveSource() {
    if (this.#sourceElement === null) return;

    if (this.#sourceElement instanceof FolkGeometry) {
      this.#sourceElement.removeEventListener('resize', this.#sourceHandler);
      this.#sourceElement.removeEventListener('move', this.#sourceHandler);
    } else if (this.#sourceElement instanceof HTMLIFrameElement && this.#sourceIframeSelector) {
      window.removeEventListener('message', this.#sourcePostMessage);
      clientRectObserver.unobserve(this.#sourceElement, this.#sourceIframeCallback);
      this.#sourceElement.contentWindow?.postMessage({
        type: 'folk-unobserve-element',
        selector: this.#sourceIframeSelector,
      });
    } else {
      clientRectObserver.unobserve(this.#sourceElement, this.#sourceCallback);
    }
  }

  observeTarget() {
    this.unobserveTarget();

    const vertex = parseVertex(this.#target);

    if (vertex) {
      this.#targetRect = DOMRectReadOnly.fromRect(vertex);
      this.#update();
    } else {
      const [selector, iframeSelector] = parseCSSSelector(this.#target);
      this.#targetIframeSelector = iframeSelector;
      this.#targetElement = document.querySelector(selector);

      if (!this.#targetElement) {
        throw new Error('target is not a valid element');
      } else if (this.#targetElement instanceof FolkGeometry) {
        this.#targetElement.addEventListener('resize', this.#targetHandler);
        this.#targetElement.addEventListener('move', this.#targetHandler);
      } else if (this.#targetElement instanceof HTMLIFrameElement && this.#targetIframeSelector) {
        window.addEventListener('message', this.#targetPostMessage);
        clientRectObserver.observe(this.#targetElement, this.#targetIframeCallback);
        this.#targetElement.contentWindow?.postMessage({
          type: 'folk-observe-element',
          selector: this.#targetIframeSelector,
        });
      } else {
        clientRectObserver.observe(this.#targetElement, this.#targetCallback);
      }
      this.#targetRect = this.#targetElement.getBoundingClientRect();
    }
  }

  unobserveTarget() {
    if (this.#targetElement === null) return;

    if (this.#targetElement instanceof FolkGeometry) {
      this.#targetElement.removeEventListener('resize', this.#targetHandler);
      this.#targetElement.removeEventListener('move', this.#targetHandler);
    } else if (this.#targetElement instanceof HTMLIFrameElement && this.#targetIframeSelector) {
      window.removeEventListener('message', this.#targetPostMessage);
      clientRectObserver.unobserve(this.#targetElement, this.#targetIframeCallback);
      this.#targetElement.contentWindow?.postMessage({
        type: 'folk-unobserve-element',
        selector: this.#targetIframeSelector,
      });
    } else {
      clientRectObserver.unobserve(this.#targetElement, this.#targetCallback);
    }
  }

  #update() {
    if (this.#sourceRect === undefined || this.#targetRect === undefined) return;

    this.render(this.#sourceRect, this.#targetRect);
  }

  // @ts-ignore
  render(sourceRect: DOMRectReadOnly, targetRect: DOMRectReadOnly) {}
}
