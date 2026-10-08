import { StateEffect, StateField } from "@codemirror/state";
import { type EditorView, type Panel, showPanel } from "@codemirror/view";

export type LocationItem = {
  uri: string;
  /** 0-based */
  line: number;
  character: number;
  label: string;
};

type PanelSpec = {
  title: string;
  items: LocationItem[];
  onPick: (item: LocationItem) => void;
};

export const setLocationList = StateEffect.define<PanelSpec | null>();

const locationsField = StateField.define<PanelSpec | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setLocationList)) return e.value;
    }
    return value;
  },
  provide: (f) =>
    showPanel.from(f, (spec) =>
      spec ? (view) => createPanel(view, spec) : null,
    ),
});

export function openLocationsPanel(view: EditorView, spec: PanelSpec): void {
  view.dispatch({ effects: setLocationList.of(spec) });
}

function closePanel(view: EditorView): void {
  view.dispatch({ effects: setLocationList.of(null) });
  view.focus();
}

function createPanel(view: EditorView, spec: PanelSpec): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-lsp-locations";

  const header = document.createElement("div");
  header.className = "cm-lsp-locations-header";
  header.textContent = `${spec.title} (${spec.items.length})`;
  dom.appendChild(header);

  let searchInput: HTMLInputElement | null = null;
  let filteredItems = spec.items;
  let active = 0;

  const list = document.createElement("ul");
  list.tabIndex = 0;

  if (spec.items.length > 4) {
    const searchWrap = document.createElement("div");
    searchWrap.className = "cm-lsp-locations-search";
    searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Filter symbols or locations...";
    searchWrap.appendChild(searchInput);
    dom.appendChild(searchWrap);
  }

  dom.appendChild(list);

  let rows: HTMLElement[] = [];

  const pick = (item: LocationItem) => {
    closePanel(view);
    spec.onPick(item);
  };

  const renderActive = () => {
    rows.forEach((row, i) => {
      row.classList.toggle("cm-lsp-locations-active", i === active);
    });
    rows[active]?.scrollIntoView({ block: "nearest" });
  };

  const rebuildRows = () => {
    list.replaceChildren();
    rows = filteredItems.map((item) => {
      const li = document.createElement("li");
      li.textContent = item.label;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(item);
      });
      list.appendChild(li);
      return li;
    });
    active = Math.min(active, Math.max(0, filteredItems.length - 1));
    renderActive();
  };

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = (searchInput?.value || "").toLowerCase().trim();
      filteredItems = query
        ? spec.items.filter((it) => it.label.toLowerCase().includes(query))
        : spec.items;
      active = 0;
      rebuildRows();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        active = Math.min(active + 1, filteredItems.length - 1);
        renderActive();
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        active = Math.max(active - 1, 0);
        renderActive();
        e.preventDefault();
      } else if (e.key === "Enter") {
        if (filteredItems[active]) pick(filteredItems[active]);
        e.preventDefault();
      } else if (e.key === "Escape") {
        closePanel(view);
        e.preventDefault();
      }
    });
  }

  list.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      active = Math.min(active + 1, filteredItems.length - 1);
      renderActive();
    } else if (e.key === "ArrowUp") {
      active = Math.max(active - 1, 0);
      renderActive();
    } else if (e.key === "Enter") {
      if (filteredItems[active]) pick(filteredItems[active]);
    } else if (e.key === "Escape") {
      closePanel(view);
    } else {
      return;
    }
    e.preventDefault();
  });

  rebuildRows();
  return {
    dom,
    mount: () => {
      if (searchInput) searchInput.focus();
      else list.focus();
    },
  };
}

export const locationsPanel = locationsField;

