import type { MapPlugin } from "./core";

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
