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

import sheetStyles from "./proof-sheet.css?inline";

const template = document.createElement("template");
template.innerHTML = `
  <style>${sheetStyles}</style>

  <div class="sheet-layout">
    <main class="grid-container" id="grid"></main>
  </div>
`;

const sectionTemplate = document.createElement("template");
sectionTemplate.innerHTML = `
  <article class="sheet-card">
    <header class="card-header">
      <div class="card-title-wrap">
        <span class="card-coord"></span>
        <span class="card-title"></span>
      </div>
    </header>
    <div class="card-previews"></div>
  </article>
`;

const previewTemplate = document.createElement("template");
previewTemplate.innerHTML = `
  <div class="card-preview">
    <img alt="Screenshot artifact">
  </div>
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

    // Group items by quadrant/zone
    const zoneOrder = ["square-1", "square-2", "square-3", "square-4"];
    const groups = new Map<string, ProofItem[]>();
    for (const item of this.#items) {
      const z = item.zone || "square-1";
      if (!groups.has(z)) groups.set(z, []);
      groups.get(z)!.push(item);
    }

    const sortedZones = Array.from(groups.keys()).sort((a, b) => {
      const idxA = zoneOrder.indexOf(a);
      const idxB = zoneOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    // Toggle single column attribute if only 1 quadrant has items
    if (sortedZones.length <= 1) {
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

    // Clear and stamp cards by section
    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    for (const zone of sortedZones) {
      const items = groups.get(zone)!;
      const clone = sectionTemplate.content.cloneNode(true) as DocumentFragment;
      const cfg = this.#qcfg[zone] || {
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

      const previewsContainer = clone.querySelector(".card-previews") as HTMLElement;
      if (previewsContainer) {
        previewsContainer.dataset.count = String(items.length);
        if (items.length > 1) previewsContainer.classList.add("multi");
        for (const item of items) {
          const previewClone = previewTemplate.content.cloneNode(true) as DocumentFragment;
          const img = previewClone.querySelector("img");
          if (img) {
            img.src = item.url;
            img.alt = item.name;
          }
          previewsContainer.appendChild(previewClone);
        }
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
