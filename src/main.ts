import "./style.css";
import "./proof-sheet";
import { domToPng } from "modern-screenshot";
import type { ProofItem, ProofSheetLayout, QuadrantConfig } from "./proof-sheet";

export interface ScreenshotItem extends ProofItem {
  createdAt: number;
}

interface TitlesState {
  sq1?: string;
  sq2?: string;
  sq3?: string;
  sq4?: string;
}

// Storage Engine (IndexedDB with localStorage Fallback)
const DB_NAME = "ScreenshotSorterDB";
const STORE_ITEMS = "screenshots";
const STORE_META = "metadata";

const dbPromise = new Promise<IDBDatabase | null>((res) => {
  if (typeof window === "undefined" || !window.indexedDB) return res(null);
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
    const db = (e.target as IDBOpenDBRequest).result;
    [STORE_ITEMS, STORE_META].forEach((s) => {
      if (!db.objectStoreNames.contains(s)) {
        db.createObjectStore(s, { keyPath: s === STORE_ITEMS ? "id" : "key" });
      }
    });
  };
  req.onsuccess = () => res(req.result);
  req.onerror = () => res(null);
});

async function idb<T>(
  store: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await dbPromise;
  if (!db) return null;
  return new Promise((res) => {
    try {
      const tx = db.transaction(store, mode);
      const req = op(tx.objectStore(store));
      tx.oncomplete = () => res((req ? req.result : true) as T);
      tx.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}

const Storage = {
  getAll: (): Promise<ScreenshotItem[]> =>
    idb<ScreenshotItem[]>(STORE_ITEMS, "readonly", (s) => s.getAll()).then(
      (r) => r ?? JSON.parse(localStorage.getItem("screenshot_items") || "[]"),
    ),
  save: (item: ScreenshotItem) =>
    idb(STORE_ITEMS, "readwrite", (s) => s.put(item)).then((ok) => {
      if (!ok) {
        try {
          localStorage.setItem("screenshot_items", JSON.stringify(state.items));
        } catch {}
      }
    }),
  delete: (id: string) =>
    idb(STORE_ITEMS, "readwrite", (s) => s.delete(id)).then((ok) => {
      if (!ok) {
        try {
          localStorage.setItem("screenshot_items", JSON.stringify(state.items));
        } catch {}
      }
    }),
  clearAll: async () => {
    localStorage.removeItem("screenshot_items");
    localStorage.removeItem("screenshot_titles");
    await idb(STORE_ITEMS, "readwrite", (s) => s.clear());
    await idb(STORE_META, "readwrite", (s) => s.clear());
  },
  saveTitles: (titles: TitlesState) => {
    try {
      localStorage.setItem("screenshot_titles", JSON.stringify(titles));
    } catch {}
    void idb(STORE_META, "readwrite", (s) => s.put({ key: "titles", val: titles }));
  },
  loadTitles: (): Promise<TitlesState | null> =>
    idb<{ key: string; val: TitlesState }>(STORE_META, "readonly", (s) => s.get("titles")).then(
      (r) => r?.val ?? JSON.parse(localStorage.getItem("screenshot_titles") || "null"),
    ),
};

// State & Selectors
const state: { items: ScreenshotItem[] } = { items: [] };
let draggedItemId: string | null = null;
let activeMenu: HTMLElement | null = null;
let compositeBlob: Blob | null = null;
let compositeUrl: string | null = null;

const $ = (id: string) => document.getElementById(id);
const qcfg: Record<string, QuadrantConfig> = {
  "square-1": { id: "title-sq-1", code: "1", label: "Priority Issues", color: "#38bdf8" },
  "square-2": { id: "title-sq-2", code: "2", label: "Design References", color: "#f59e0b" },
  "square-3": { id: "title-sq-3", code: "3", label: "Typography & UI Polish", color: "#10b981" },
  "square-4": { id: "title-sq-4", code: "4", label: "Accepted & Archived", color: "#a855f7" },
};

function flashSync() {
  const dot = $("statusDot");
  const txt = $("storageStatusText");
  if (dot) dot.style.cssText = "background:#38bdf8;box-shadow:0 0 8px #38bdf8";
  if (txt) txt.textContent = "Synced";
  setTimeout(() => {
    if (dot) dot.style.cssText = "background:#10b981;box-shadow:0 0 6px #10b981";
    if (txt) txt.textContent = "Local Ready";
  }, 1000);
}

async function addScreenshot(url: string, name = "Screenshot", zone = "tray") {
  const item: ScreenshotItem = {
    id: "snip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    url,
    name,
    zone,
    createdAt: Date.now(),
  };
  state.items.push(item);
  render();
  await Storage.save(item);
  flashSync();
}

function handleFiles(files: FileList | File[] | null, zone = "tray") {
  Array.from(files || []).forEach((f) => {
    if (!f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = (e) => {
      if (typeof e.target?.result === "string") {
        void addScreenshot(e.target.result, f.name, zone);
      }
    };
    r.readAsDataURL(f);
  });
}

async function moveItem(id: string, zone: string) {
  const item = state.items.find((i) => i.id === id);
  if (item) {
    item.zone = zone;
    render();
    await Storage.save(item);
    flashSync();
  }
}

// Render Workbench
function render() {
  const zones: Record<string, HTMLElement | null> = {
    tray: $("trayList"),
    "square-1": document.querySelector<HTMLElement>(".cell-q1 .cell-body"),
    "square-2": document.querySelector<HTMLElement>(".cell-q2 .cell-body"),
    "square-3": document.querySelector<HTMLElement>(".cell-q3 .cell-body"),
    "square-4": document.querySelector<HTMLElement>(".cell-q4 .cell-body"),
  };
  Object.values(zones).forEach((el) => el && (el.innerHTML = ""));

  state.items.forEach((item) => {
    const parent = zones[item.zone] || zones.tray;
    if (!parent) return;
    const card = document.createElement("div");
    card.className = "screenshot-card";
    card.draggable = true;
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="img-frame">
        <img src="${item.url}" alt="${item.name}">
        <div class="card-actions-dock">
          <button class="tool-btn zoom-btn" title="Zoom"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg></button>
          <button class="tool-btn delete-btn" title="Delete"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="card-footer"><span class="card-filename" title="${item.name}">${item.name}</span></div>
    `;
    card.addEventListener("dragstart", (e) => {
      draggedItemId = item.id;
      card.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", item.id);
    });
    card.addEventListener("dragend", () => {
      draggedItemId = null;
      card.classList.remove("dragging");
      document.querySelectorAll(".matrix-cell").forEach((c) => c.classList.remove("drag-over"));
    });
    parent.appendChild(card);
  });

  const tCount = state.items.filter((i) => i.zone === "tray").length;
  const trayCountEl = $("trayCount");
  if (trayCountEl) trayCountEl.textContent = `${tCount} ${tCount === 1 ? "item" : "items"}`;
  [1, 2, 3, 4].forEach((n) => {
    const count = state.items.filter((i) => i.zone === `square-${n}`).length;
    const countEl = $(`count-sq-${n}`);
    if (countEl) countEl.textContent = `${count} ${count === 1 ? "item" : "items"}`;
  });
}

// Unified Delegated Event Handlers
document.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const card = target.closest<HTMLElement>(".screenshot-card");
  const item = card ? state.items.find((i) => i.id === card.dataset.id) : null;

  if (target.closest(".dispatch-btn")) {
    const menu = card?.querySelector<HTMLElement>(".dispatch-menu");
    if (activeMenu && activeMenu !== menu) activeMenu.classList.remove("show");
    if (menu) {
      menu.classList.toggle("show");
      activeMenu = menu.classList.contains("show") ? menu : null;
    }
    return;
  }
  if (target.closest(".dispatch-item")) {
    const moveBtn = target.closest<HTMLElement>(".dispatch-item");
    const targetZone = moveBtn?.dataset.move;
    activeMenu?.classList.remove("show");
    activeMenu = null;
    if (item && targetZone) {
      return moveItem(item.id, targetZone);
    }
    return;
  }
  if (target.closest(".zoom-btn")) {
    if (item) return openLightbox(item.url, item.name);
    return;
  }
  if (target.closest(".delete-btn")) {
    if (item) {
      state.items = state.items.filter((i) => i.id !== item.id);
      render();
      return Storage.delete(item.id);
    }
    return;
  }
  if (activeMenu && !activeMenu.contains(target)) {
    activeMenu.classList.remove("show");
    activeMenu = null;
  }
});

document.addEventListener("dblclick", (e) => {
  const target = e.target as HTMLElement | null;
  const card = target?.closest<HTMLElement>(".screenshot-card");
  const item = card ? state.items.find((i) => i.id === card.dataset.id) : null;
  if (item) openLightbox(item.url, item.name);
});

// Native Paste Listener
window.addEventListener("paste", (e: ClipboardEvent) => {
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.type.includes("image")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (typeof evt.target?.result === "string") {
          void addScreenshot(evt.target.result, `Pasted · ${new Date().toLocaleTimeString()}`);
        }
      };
      const file = it.getAsFile();
      if (file) reader.readAsDataURL(file);
      e.preventDefault();
    }
  }
});

// Drag and Drop (Internal Cards + OS Files)
const getZone = (el: Element | null) =>
  (el?.closest?.("[data-zone-id]") as HTMLElement | null)?.dataset.zoneId;
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
let dragCounter = 0;

window.addEventListener("dragenter", (e: DragEvent) => {
  if (hasFiles(e) && ++dragCounter === 1) {
    const overlay = $("globalDropOverlay");
    if (overlay) overlay.style.display = "flex";
  }
});
window.addEventListener("dragleave", (e: DragEvent) => {
  if (hasFiles(e) && --dragCounter <= 0) {
    dragCounter = 0;
    const overlay = $("globalDropOverlay");
    if (overlay) overlay.style.display = "none";
  }
});
window.addEventListener("dragover", (e: DragEvent) => {
  if (!draggedItemId && !hasFiles(e)) return;
  e.preventDefault();
  const zone = getZone(e.target as Element | null);
  document.querySelectorAll<HTMLElement>(".matrix-cell, .dock-panel").forEach((c) => {
    c.classList.toggle("drag-over", c.dataset.zoneId === zone);
  });
});
window.addEventListener("drop", (e: DragEvent) => {
  const zone = getZone(e.target as Element | null) || "tray";
  dragCounter = 0;
  const overlay = $("globalDropOverlay");
  if (overlay) overlay.style.display = "none";
  document.querySelectorAll<HTMLElement>(".matrix-cell, .dock-panel").forEach((c) => {
    c.classList.remove("drag-over");
  });
  if (e.dataTransfer?.files?.length) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files, zone);
  } else if (draggedItemId) {
    e.preventDefault();
    void moveItem(draggedItemId, zone);
  }
});

// Controls & Modals Wiring
const fileInput = $("fileInput") as HTMLInputElement | null;
const uploadBtn = $("uploadBtn");
if (uploadBtn && fileInput) uploadBtn.onclick = () => fileInput.click();

const dropzoneBox = $("dropzoneBox");
if (dropzoneBox && fileInput) {
  dropzoneBox.onclick = () => fileInput.click();
  dropzoneBox.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  };
}

if (fileInput) {
  fileInput.onchange = (e) => {
    const input = e.target as HTMLInputElement;
    handleFiles(input.files);
    input.value = "";
  };
}

const clearAllBtn = $("clearAllBtn");
if (clearAllBtn) {
  clearAllBtn.onclick = async () => {
    if (!state.items.length || !confirm("Clear all screenshots and persistent browser storage?"))
      return;
    state.items = [];
    render();
    await Storage.clearAll();
    flashSync();
  };
}

const exportBtn = $("exportBtn");
if (exportBtn) {
  exportBtn.onclick = () => {
    if (!state.items.length) return alert("No screenshots to export yet.");
    const data = {
      generatedAt: new Date().toISOString(),
      categories: {
        q1: $("title-sq-1")?.textContent?.trim(),
        q2: $("title-sq-2")?.textContent?.trim(),
        q3: $("title-sq-3")?.textContent?.trim(),
        q4: $("title-sq-4")?.textContent?.trim(),
      },
      items: state.items,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    a.download = `proofsheet-${Date.now()}.json`;
    a.click();
  };
}

document.querySelectorAll<HTMLElement>(".editable-label").forEach((el) => {
  el.onblur = () =>
    Storage.saveTitles({
      sq1: $("title-sq-1")?.textContent?.trim(),
      sq2: $("title-sq-2")?.textContent?.trim(),
      sq3: $("title-sq-3")?.textContent?.trim(),
      sq4: $("title-sq-4")?.textContent?.trim(),
    });
  el.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    }
  };
});

function openLightbox(src: string, caption: string) {
  const modalImg = $("modalImg") as HTMLImageElement | null;
  const modalCaption = $("modalCaption");
  if (modalImg) modalImg.src = src;
  if (modalCaption) modalCaption.textContent = caption;
  $("imageModal")?.classList.add("active");
}

const closeModals = () => {
  $("imageModal")?.classList.remove("active");
  $("compositeModal")?.classList.remove("active");
};

const modalClose = $("modalClose");
if (modalClose) modalClose.onclick = closeModals;

const closeCompositeBtn = $("closeCompositeBtn");
if (closeCompositeBtn) closeCompositeBtn.onclick = closeModals;

window.addEventListener("keydown", (e) => e.key === "Escape" && closeModals());

// Generate Architectural Samples via Canvas
const sampleBtn = $("sampleBtn");
if (sampleBtn) {
  sampleBtn.onclick = () => {
    const samples = [
      {
        label: "Mobile Nav Friction",
        zone: "square-1",
        accent: "#38bdf8",
        sub: "Primary checkout flow drop-off at navigation breakpoint",
        badge: "BUG · CRITICAL",
      },
      {
        label: "Archival Grid Reference",
        zone: "square-2",
        accent: "#f59e0b",
        sub: "Swiss rationalist 12-column modular contact system",
        badge: "BENCHMARK",
      },
      {
        label: "Type Contrast Audit",
        zone: "square-3",
        accent: "#10b981",
        sub: "Body copy line length exceeded 85ch on ultrawide viewports",
        badge: "POLISH",
      },
      {
        label: "Design System Tokens v4",
        zone: "square-4",
        accent: "#a855f7",
        sub: "Harmonized chromatic values and elevation tokens",
        badge: "DOCUMENTED",
      },
    ];
    samples.forEach((s) => {
      const c = document.createElement("canvas");
      c.width = 540;
      c.height = 360;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0e141f";
      ctx.fillRect(0, 0, 540, 360);
      ctx.strokeStyle = "#1a2333";
      ctx.lineWidth = 1;
      for (let x = 30; x < 540; x += 30) {
        ctx.strokeRect(x, 0, 0.1, 360);
      }
      for (let y = 30; y < 360; y += 30) {
        ctx.strokeRect(0, y, 540, 0.1);
      }
      ctx.fillStyle = "#161f2e";
      ctx.fillRect(0, 0, 540, 44);
      ["#ef4444", "#f59e0b", "#10b981"].forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(22 + i * 16, 22, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 12px monospace";
      ctx.fillText("AUDIT_SPEC_2026.TSX", 380, 26);
      ctx.fillStyle = "#131b28";
      ctx.strokeStyle = "#25344c";
      ctx.fillRect(40, 75, 460, 240);
      ctx.strokeRect(40, 75, 460, 240);
      ctx.fillStyle = s.accent;
      ctx.fillRect(40, 75, 6, 240);
      ctx.fillStyle = "#1e2a3c";
      ctx.fillRect(70, 105, 110, 24);
      ctx.fillStyle = s.accent;
      ctx.font = "bold 11px monospace";
      ctx.fillText(s.badge, 80, 121);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(s.label, 70, 170);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px sans-serif";
      ctx.fillText(s.sub, 70, 205);
      ctx.fillStyle = "#223046";
      ctx.fillRect(70, 245, 400, 36);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 12px monospace";
      ctx.fillText("STATUS: PROCESSED · RESOLUTION: 1920×1080", 85, 268);
      void addScreenshot(c.toDataURL("image/png"), `${s.label}.png`, s.zone);
    });
  };
}

// Composite Proof Sheet Generator (modern-screenshot via Shadow DOM <proof-sheet> Web Component)
let currentLayout: ProofSheetLayout =
  (localStorage.getItem("proofsheet_layout") as ProofSheetLayout) || "stack";

function updateLayoutSegmentUI(layout: ProofSheetLayout) {
  document.querySelectorAll(".segment-btn").forEach((btn) => {
    const el = btn as HTMLButtonElement;
    if (el.dataset.layout === layout) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

updateLayoutSegmentUI(currentLayout);

async function generateComposite(layout: ProofSheetLayout = currentLayout) {
  const qItems = state.items.filter((i) => i.zone.startsWith("square-"));
  if (!qItems.length) return null;

  const zones = ["square-1", "square-2", "square-3", "square-4"];
  qItems.sort((a, b) => zones.indexOf(a.zone) - zones.indexOf(b.zone));

  const isLight = document.documentElement.dataset.theme === "light";
  const stage = document.createElement("proof-sheet");
  if (isLight) {
    stage.setAttribute("data-theme", "light");
  }
  stage.configure({ items: qItems, qcfg, layout });
  document.body.appendChild(stage);

  try {
    await stage.waitForImages();
    const dataUrl = await domToPng(stage, {
      backgroundColor: isLight ? "#f8fafc" : "#0b0f17",
      scale: 1,
      style: {
        left: "0",
        top: "0",
      },
    });

    compositeUrl = dataUrl;
    const res = await fetch(dataUrl);
    compositeBlob = await res.blob();
    const resultImg = $("compositeResultImg") as HTMLImageElement | null;
    if (resultImg) resultImg.src = dataUrl;
    return dataUrl;
  } finally {
    stage.remove();
  }
}

const segmentBtns = document.querySelectorAll(".segment-btn");
segmentBtns.forEach((btn) => {
  const el = btn as HTMLButtonElement;
  el.onclick = async () => {
    const targetLayout = (el.dataset.layout as ProofSheetLayout) || "stack";
    if (targetLayout === currentLayout && compositeUrl) return;
    currentLayout = targetLayout;
    localStorage.setItem("proofsheet_layout", currentLayout);
    updateLayoutSegmentUI(currentLayout);

    if ($("compositeModal")?.classList.contains("active")) {
      const resultImg = $("compositeResultImg") as HTMLImageElement | null;
      if (resultImg) resultImg.style.opacity = "0.4";
      try {
        await generateComposite(currentLayout);
      } catch (err: unknown) {
        console.error("Re-synthesis failed:", err);
      } finally {
        if (resultImg) resultImg.style.opacity = "1";
      }
    }
  };
});

const createQuadrantImgBtn = $("createQuadrantImgBtn") as HTMLButtonElement | null;
if (createQuadrantImgBtn) {
  createQuadrantImgBtn.onclick = async () => {
    const qItems = state.items.filter((i) => i.zone.startsWith("square-"));
    if (!qItems.length)
      return alert("No screenshots found in Quadrants 1–4. Drag screenshots into quadrants first.");

    const btn = createQuadrantImgBtn;
    const prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="spin"><circle cx="12" cy="12" r="10" stroke-opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg> Synthesizing...`;

    try {
      updateLayoutSegmentUI(currentLayout);
      await generateComposite(currentLayout);
      $("compositeModal")?.classList.add("active");
    } catch (err: unknown) {
      console.error("Synthesis failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert("Failed to generate proof sheet: " + errMsg);
    } finally {
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  };
}

// Composite Actions
const downloadCompositeBtn = $("downloadCompositeBtn");
if (downloadCompositeBtn) {
  downloadCompositeBtn.onclick = () => {
    if (!compositeUrl) return;
    const a = document.createElement("a");
    a.href = compositeUrl;
    a.download = `proofsheet-matrix-${Date.now()}.png`;
    a.click();
  };
}

const copyCompositeBtn = $("copyCompositeBtn");
if (copyCompositeBtn) {
  copyCompositeBtn.onclick = async () => {
    if (!compositeBlob || !navigator.clipboard?.write) {
      return alert("Clipboard copy not supported. Please use Download PNG.");
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": compositeBlob })]);
      copyCompositeBtn.textContent = "Copied to Clipboard";
      setTimeout(() => {
        copyCompositeBtn.textContent = "Copy Image";
      }, 1500);
    } catch {
      alert("Could not copy image to clipboard.");
    }
  };
}

// Theme Management
function initTheme() {
  const stored = localStorage.getItem("theme") as "light" | "dark" | null;
  const system = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  const theme = stored || system;
  document.documentElement.dataset.theme = theme;

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) {
      document.documentElement.dataset.theme = e.matches ? "light" : "dark";
    }
  });

  const toggleBtn = $("themeToggleBtn") as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.onclick = async () => {
      const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("theme", next);

      if ($("compositeModal")?.classList.contains("active")) {
        const resultImg = $("compositeResultImg") as HTMLImageElement | null;
        if (resultImg) resultImg.style.opacity = "0.4";
        try {
          await generateComposite(currentLayout);
        } catch (err: unknown) {
          console.error("Re-synthesis failed on theme toggle:", err);
        } finally {
          if (resultImg) resultImg.style.opacity = "1";
        }
      }
    };
  }
}

// Initialization
void (async function init() {
  initTheme();
  const titles = await Storage.loadTitles();
  if (titles) {
    ([1, 2, 3, 4] as const).forEach((n) => {
      const val = titles[`sq${n}` as keyof TitlesState];
      const titleEl = $(`title-sq-${n}`);
      if (val && titleEl) titleEl.textContent = val;
    });
  }
  state.items = await Storage.getAll();
  render();
})();
