// A "coloring" plugin owns the municipality fill-color paint property, so
// only one per category may be active at a time (the manager enforces
// this). Future non-coloring categories (e.g. an overlay that doesn't
// touch fill-color) would be free to stack alongside a coloring plugin.
export type PluginCategory = "coloring";

export interface MapPlugin {
  id: string;
  name: string;
  category: PluginCategory;
  onActivate(): void;
  onDeactivate(): void;
  renderConfig(container: HTMLElement): void;
  /** Optional: inject a section into the municipality info panel, right
   * under the identity header, while this plugin is active. */
  renderPanel?(container: HTMLElement, properties: Record<string, unknown>): void;
}

export class PluginManager {
  private plugins: MapPlugin[] = [];
  private active = new Set<string>();
  private checkboxes = new Map<string, HTMLInputElement>();
  private configContainers = new Map<string, HTMLElement>();

  register(plugin: MapPlugin): void {
    this.plugins.push(plugin);
  }

  /** Builds the plugin checkbox list into `root`. */
  mount(root: HTMLElement): void {
    const list = document.createElement("ul");
    list.className = "plugin-list";

    for (const plugin of this.plugins) {
      const item = document.createElement("li");
      item.className = "plugin-item";

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      label.append(checkbox, document.createTextNode(` ${plugin.name}`));
      item.append(label);

      const config = document.createElement("div");
      config.className = "plugin-config";
      config.hidden = true;
      item.append(config);

      this.checkboxes.set(plugin.id, checkbox);
      this.configContainers.set(plugin.id, config);

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.activate(plugin);
        else this.deactivate(plugin);
      });

      list.append(item);
    }

    root.append(list);
  }

  private activate(plugin: MapPlugin): void {
    for (const other of this.plugins) {
      if (other.id !== plugin.id && other.category === plugin.category && this.active.has(other.id)) {
        this.deactivate(other);
      }
    }

    this.active.add(plugin.id);
    plugin.onActivate();

    const config = this.configContainers.get(plugin.id);
    if (config) {
      config.innerHTML = "";
      plugin.renderConfig(config);
      config.hidden = false;
    }
  }

  private deactivate(plugin: MapPlugin): void {
    this.active.delete(plugin.id);
    plugin.onDeactivate();

    const checkbox = this.checkboxes.get(plugin.id);
    if (checkbox) checkbox.checked = false;

    const config = this.configContainers.get(plugin.id);
    if (config) {
      config.hidden = true;
      config.innerHTML = "";
    }
  }

  /** Panel sections contributed by currently active plugins, for a
   * selected municipality's properties. */
  getActivePanelSections(properties: Record<string, unknown>): HTMLElement[] {
    const sections: HTMLElement[] = [];
    for (const plugin of this.plugins) {
      if (this.active.has(plugin.id) && plugin.renderPanel) {
        const container = document.createElement("div");
        container.className = "panel-plugin-section";
        plugin.renderPanel(container, properties);
        sections.push(container);
      }
    }
    return sections;
  }
}

export interface ProvinceOption {
  code: string;
  name: string;
}

export function createProvinceHighlightPlugin(
  provinces: ProvinceOption[],
  setHighlight: (codes: string[] | null) => void,
): MapPlugin {
  const selected = new Set<string>();

  function apply() {
    setHighlight(selected.size > 0 ? Array.from(selected) : null);
  }

  return {
    id: "province-highlight",
    name: "Highlight province",
    category: "coloring",
    onActivate: apply,
    onDeactivate() {
      selected.clear();
      setHighlight(null);
    },
    renderConfig(container) {
      const list = document.createElement("ul");
      list.className = "plugin-province-list";

      for (const province of provinces) {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(province.code);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(province.code);
          else selected.delete(province.code);
          apply();
        });
        label.append(checkbox, document.createTextNode(` ${province.name}`));
        item.append(label);
        list.append(item);
      }

      container.append(list);
    },
  };
}
