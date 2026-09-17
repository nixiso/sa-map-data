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
  /** Optional: render into the shared bottom controls bar while this
   * plugin is active (e.g. a year slider). Only one plugin owns the bar
   * at a time — whichever is currently active with this defined. */
  renderControls?(container: HTMLElement): void;
}

export class PluginManager {
  private plugins: MapPlugin[] = [];
  private active = new Set<string>();
  private checkboxes = new Map<string, HTMLInputElement>();
  private configContainers = new Map<string, HTMLElement>();
  private controlsContainer: HTMLElement | null = null;
  private controlsOwnerId: string | null = null;

  register(plugin: MapPlugin): void {
    this.plugins.push(plugin);
  }

  /** Builds the plugin checkbox list into `root`. `controlsRoot`, if
   * given, becomes the shared bottom bar plugins can render controls
   * into (e.g. a year slider) while active. */
  mount(root: HTMLElement, controlsRoot?: HTMLElement): void {
    this.controlsContainer = controlsRoot ?? null;
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

    if (plugin.renderControls && this.controlsContainer) {
      this.controlsContainer.innerHTML = "";
      plugin.renderControls(this.controlsContainer);
      this.controlsContainer.hidden = false;
      this.controlsOwnerId = plugin.id;
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

    if (this.controlsOwnerId === plugin.id && this.controlsContainer) {
      this.controlsContainer.hidden = true;
      this.controlsContainer.innerHTML = "";
      this.controlsOwnerId = null;
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
