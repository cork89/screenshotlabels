/**
 * ProofSheet Web Component (<proof-sheet>)
 * Encapsulates the off-screen layout and synthesis stage using Shadow DOM (mode: 'open'),
 * <template> stamping, and reactive property setters.
 */

export interface ProofItem {
  id: string;
  url: string;
  name: string;
  time: string;
  zone: string;
  createdAt?: number;
}

export interface QuadrantConfig {
  id: string;
  code: string;
  label: string;
  color: string;
}

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      display: block;
      position: fixed;
      left: 0;
      top: 0;
      z-index: -9999;
      pointer-events: none;
      background: #0b0f17;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 40px;
      box-sizing: border-box;
      width: 1480px;
    }
    :host([single]) {
      width: 880px;
    }
    .sheet-layout {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #1e293b;
      padding-bottom: 20px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      background: #121824;
      border: 1px solid #27354d;
      border-radius: 8px;
      display: grid;
      grid-template: 1fr 1fr / 1fr 1fr;
      padding: 7px;
      gap: 3px;
      box-sizing: border-box;
    }
    .mark-c1 { background: #38bdf8; border-radius: 2px; }
    .mark-c2 { background: #f59e0b; border-radius: 2px; }
    .mark-c3 { background: #10b981; border-radius: 2px; }
    .mark-c4 { background: #a855f7; border-radius: 2px; }
    .sheet-title {
      font-size: 1.6rem;
      font-weight: 800;
      margin: 0;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .sheet-meta {
      font-size: 0.82rem;
      color: #94a3b8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      margin: 3px 0 0;
    }
    .item-badge {
      background: #121824;
      border: 1px solid #27354d;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 0.85rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #cbd5e1;
      font-weight: 600;
      text-transform: uppercase;
    }
    .grid-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    :host([single]) .grid-container {
      grid-template-columns: 1fr;
    }
    .sheet-card {
      background: #121824;
      border: 1px solid #27354d;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 10px;
    }
    .card-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-coord {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 6px;
      border-radius: 4px;
    }
    .card-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.015em;
    }
    .card-filename {
      font-size: 0.78rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #94a3b8;
      background: #0b0f17;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid #1e293b;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-preview {
      background: #080c12;
      border: 1px solid #1e293b;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      min-height: 340px;
      max-height: 520px;
      overflow: hidden;
    }
    .card-preview img {
      max-width: 100%;
      max-height: 490px;
      object-fit: contain;
      border-radius: 4px;
      display: block;
    }
  </style>

  <div class="sheet-layout">
    <header class="sheet-header">
      <div class="brand-wrap">
        <div class="brand-mark" aria-hidden="true">
          <div class="mark-c1"></div>
          <div class="mark-c2"></div>
          <div class="mark-c3"></div>
          <div class="mark-c4"></div>
        </div>
        <div>
          <h2 class="sheet-title">ProofSheet · Visual Quadrant Synthesis</h2>
          <p class="sheet-meta" id="metaTimestamp"></p>
        </div>
      </div>
      <div class="item-badge" id="countBadge"></div>
    </header>

    <main class="grid-container" id="grid"></main>
  </div>
`;

const cardTemplate = document.createElement("template");
cardTemplate.innerHTML = `
  <article class="sheet-card">
    <header class="card-header">
      <div class="card-title-wrap">
        <span class="card-coord"></span>
        <span class="card-title"></span>
      </div>
      <span class="card-filename"></span>
    </header>
    <div class="card-preview">
      <img alt="Screenshot artifact">
    </div>
  </article>
`;

export class ProofSheet extends HTMLElement {
  #items: ProofItem[] = [];
  #qcfg: Record<string, QuadrantConfig> = {};

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }

  get items(): ProofItem[] {
    return this.#items;
  }

  set items(val: ProofItem[]) {
    this.#items = Array.isArray(val) ? val : [];
    this.#update();
  }

  get qcfg(): Record<string, QuadrantConfig> {
    return this.#qcfg;
  }

  set qcfg(val: Record<string, QuadrantConfig>) {
    this.#qcfg = val || {};
    this.#update();
  }

  /**
   * Helper to configure items and quadrant dictionary in one call.
   */
  configure({
    items = [],
    qcfg = {},
  }: { items?: ProofItem[]; qcfg?: Record<string, QuadrantConfig> } = {}) {
    this.#qcfg = qcfg;
    this.#items = items;
    this.#update();
  }

  #update() {
    if (!this.shadowRoot) return;
    const grid = this.shadowRoot.getElementById("grid");
    const metaTimestamp = this.shadowRoot.getElementById("metaTimestamp");
    const countBadge = this.shadowRoot.getElementById("countBadge");
    if (!grid) return;

    // Toggle single column attribute
    if (this.#items.length <= 1) {
      this.setAttribute("single", "");
    } else {
      this.removeAttribute("single");
    }

    // Update header metadata
    const dateStr = new Date().toLocaleDateString().toUpperCase();
    const timeStr = new Date().toLocaleTimeString();
    if (metaTimestamp) metaTimestamp.textContent = `EXPORTED ${dateStr} · ${timeStr}`;
    if (countBadge)
      countBadge.textContent = `COUNT: ${this.#items.length} ${this.#items.length === 1 ? "ARTIFACT" : "ARTIFACTS"}`;

    // Clear and stamp cards using cardTemplate
    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    for (const item of this.#items) {
      const clone = cardTemplate.content.cloneNode(true) as DocumentFragment;
      const cfg = this.#qcfg[item.zone] || {
        code: "QUAD",
        color: "#3b82f6",
        id: "",
        label: "Quadrant",
      };
      const title = (cfg.id && document.getElementById(cfg.id)?.textContent?.trim()) || cfg.label;

      const coordEl = clone.querySelector(".card-coord") as HTMLElement;
      if (coordEl) {
        coordEl.textContent = cfg.code;
        coordEl.style.color = cfg.color;
        coordEl.style.backgroundColor = `${cfg.color}22`;
      }

      const titleEl = clone.querySelector(".card-title");
      if (titleEl) titleEl.textContent = title;

      const filenameEl = clone.querySelector(".card-filename");
      if (filenameEl) filenameEl.textContent = item.name;

      const img = clone.querySelector("img");
      if (img) {
        img.src = item.url;
        img.alt = item.name;
      }

      fragment.appendChild(clone);
    }

    grid.appendChild(fragment);
  }

  /**
   * Asynchronously wait until all images inside the shadow root have decoded/loaded.
   */
  async waitForImages(): Promise<void> {
    if (!this.shadowRoot) return;
    const imgs = Array.from(this.shadowRoot.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((r) => {
          img.onload = () => r();
          img.onerror = () => r();
        });
      }),
    );
    await new Promise((r) => setTimeout(r, 60));
  }
}

if (!customElements.get("proof-sheet")) {
  customElements.define("proof-sheet", ProofSheet);
}

declare global {
  interface HTMLElementTagNameMap {
    "proof-sheet": ProofSheet;
  }
}
