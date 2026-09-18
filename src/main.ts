import {
  Map as MapLibreMap,
  NavigationControl,
  type ExpressionSpecification,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import municipalitiesUrl from "../data/municipalities.geojson?url";
import provincesUrl from "../data/provinces.geojson?url";
import type { Feature, FeatureCollection } from "geojson";
import {
  PluginManager,
  createProvinceHighlightPlugin,
  createBudgetPlugin,
  createBudgetVsActualPlugin,
} from "./plugins";
import { getMunicipalityCode, getMunicipalityName, getMunicipalityProvince } from "./municipality";

const SOURCE_ID = "municipalities";
const FILL_LAYER_ID = "municipalities-fill";
const LINE_LAYER_ID = "municipalities-line";
const PROVINCE_SOURCE_ID = "provinces";
const PROVINCE_LINE_LAYER_ID = "provinces-line";

const BASE_COLOR = "#2b6f6a";
const HOVER_COLOR = "#3a8a83";
const SELECTED_COLOR = "#e07a3f";
const GREYED_OUT_COLOR = "#c7c7c1";

const panel = document.getElementById("panel") as HTMLElement;
const pluginsList = document.getElementById("plugins-list") as HTMLElement;
const pluginControls = document.getElementById("plugin-controls") as HTMLElement;
const pluginManager = new PluginManager();

// Simple raster basemap so the MVP doesn't depend on a vector-tile provider
// or API key. Municipal polygons are the important part (spec section 7).
const basemapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: { "raster-opacity": 0.6 },
    },
  ],
};

const map = new MapLibreMap({
  container: "map",
  style: basemapStyle,
  center: [24.7, -29.0],
  zoom: 4.8,
});

map.addControl(new NavigationControl(), "top-right");

let selectedFeatureId: number | string | undefined;
let hoveredFeatureId: number | string | undefined;
let municipalityFeatures: Feature[] = [];

// Generic contract every coloring plugin uses: a map of official
// municipality code -> fill color, or null to clear back to the default
// look. Selected/hover feature-state always takes priority over whatever
// a plugin assigns.
function buildFillColorExpr(colorByCode: Map<string, string> | null): ExpressionSpecification {
  const base: unknown[] = [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    SELECTED_COLOR,
    ["boolean", ["feature-state", "hover"], false],
    HOVER_COLOR,
  ];
  if (colorByCode && colorByCode.size > 0) {
    // Style expressions run against the raw GeoJSON, so the source's
    // actual code field ("CAT_B") is used directly here rather than the
    // JS-side candidate-list lookup used elsewhere for display purposes.
    const match: unknown[] = ["match", ["get", "CAT_B"]];
    for (const [code, color] of colorByCode) {
      match.push(code, color);
    }
    match.push(GREYED_OUT_COLOR);
    base.push(match);
  } else {
    base.push(BASE_COLOR);
  }
  return base as unknown as ExpressionSpecification;
}

function buildFillOpacityExpr(colorByCode: Map<string, string> | null): ExpressionSpecification {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    0.65,
    ["boolean", ["feature-state", "hover"], false],
    0.5,
    colorByCode && colorByCode.size > 0 ? 0.4 : 0.25,
  ] as unknown as ExpressionSpecification;
}

function applyColorOverride(colorByCode: Map<string, string> | null) {
  map.setPaintProperty(FILL_LAYER_ID, "fill-color", buildFillColorExpr(colorByCode));
  map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", buildFillOpacityExpr(colorByCode));
}

// Province-highlight plugin only knows province codes; translate that into
// the generic per-municipality color map every coloring plugin produces.
function applyProvinceHighlight(highlightProvinceCodes: string[] | null) {
  if (!highlightProvinceCodes) {
    applyColorOverride(null);
    return;
  }
  const colorByCode = new Map<string, string>();
  for (const feature of municipalityFeatures) {
    const props = feature.properties ?? {};
    const code = getMunicipalityCode(props);
    const province = getMunicipalityProvince(props);
    if (!code) continue;
    colorByCode.set(
      code,
      province && highlightProvinceCodes.includes(province) ? BASE_COLOR : GREYED_OUT_COLOR,
    );
  }
  applyColorOverride(colorByCode);
}

map.on("load", async () => {
  let geojson: FeatureCollection;

  try {
    const res = await fetch(municipalitiesUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geojson = await res.json();
  } catch (err) {
    showError(
      `Could not load municipal boundary data from data/municipalities.geojson (${
        (err as Error).message
      }). See README for how to obtain it.`,
    );
    return;
  }

  municipalityFeatures = geojson.features;

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: geojson,
    generateId: true,
  });

  map.addLayer({
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": buildFillColorExpr(null),
      "fill-opacity": buildFillOpacityExpr(null),
    },
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#1f5f5b",
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2.5,
        1,
      ],
    },
  });

  pluginManager.register(createBudgetPlugin((colorByCode) => applyColorOverride(colorByCode)));
  pluginManager.register(
    createBudgetVsActualPlugin(
      (colorByCode) => applyColorOverride(colorByCode),
      refreshSelectedPanel,
    ),
  );

  try {
    const res = await fetch(provincesUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const provinces: FeatureCollection = await res.json();

    map.addSource(PROVINCE_SOURCE_ID, { type: "geojson", data: provinces });

    // Drawn above the municipality layers as a subtle grouping outline,
    // not a click/hover target — the municipality is the entity here.
    map.addLayer({
      id: PROVINCE_LINE_LAYER_ID,
      type: "line",
      source: PROVINCE_SOURCE_ID,
      paint: {
        "line-color": "#8a7a5c",
        "line-width": 1.8,
        "line-dasharray": [3, 2],
        "line-opacity": 0.85,
      },
    });

    const provinceOptions = provinces.features
      .map((f) => ({
        code: String(f.properties?.CODE ?? ""),
        name: String(f.properties?.PROVINCE ?? f.properties?.CODE ?? ""),
      }))
      .filter((p) => p.code)
      .sort((a, b) => a.name.localeCompare(b.name));

    pluginManager.register(
      createProvinceHighlightPlugin(provinceOptions, (codes) => applyProvinceHighlight(codes)),
    );
  } catch (err) {
    console.warn(
      `Could not load province boundaries from data/provinces.geojson (${
        (err as Error).message
      }). Continuing without provincial outlines.`,
    );
  }

  pluginManager.mount(pluginsList, pluginControls);

  map.on("mousemove", FILL_LAYER_ID, (e) => {
    if (!e.features || e.features.length === 0) return;
    const feature = e.features[0];
    if (hoveredFeatureId === feature.id) return;

    if (hoveredFeatureId !== undefined) {
      map.setFeatureState(
        { source: SOURCE_ID, id: hoveredFeatureId },
        { hover: false },
      );
    }
    hoveredFeatureId = feature.id;
    map.setFeatureState({ source: SOURCE_ID, id: hoveredFeatureId }, { hover: true });
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", FILL_LAYER_ID, () => {
    if (hoveredFeatureId !== undefined) {
      map.setFeatureState(
        { source: SOURCE_ID, id: hoveredFeatureId },
        { hover: false },
      );
    }
    hoveredFeatureId = undefined;
    map.getCanvas().style.cursor = "";
  });

  map.on("click", FILL_LAYER_ID, (e) => {
    if (!e.features || e.features.length === 0) return;
    selectFeature(e.features[0]);
  });

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
    if (hits.length === 0) clearSelection();
  });
});

let selectedProperties: Record<string, unknown> | null = null;

function selectFeature(feature: MapGeoJSONFeature) {
  if (selectedFeatureId !== undefined) {
    map.setFeatureState({ source: SOURCE_ID, id: selectedFeatureId }, { selected: false });
  }
  selectedFeatureId = feature.id;
  map.setFeatureState({ source: SOURCE_ID, id: selectedFeatureId }, { selected: true });
  selectedProperties = feature.properties ?? {};
  renderPanel(selectedProperties);
}

function clearSelection() {
  if (selectedFeatureId !== undefined) {
    map.setFeatureState({ source: SOURCE_ID, id: selectedFeatureId }, { selected: false });
  }
  selectedFeatureId = undefined;
  selectedProperties = null;
  panel.hidden = true;
  panel.innerHTML = "";
}

// Lets a plugin ask for the currently-open panel to be redrawn after its
// own data changes (e.g. the budget-vs-actual year slider) — otherwise an
// already-open panel keeps showing whatever was true at the moment it was
// selected, even though the map/legend have moved on.
function refreshSelectedPanel() {
  if (selectedProperties) renderPanel(selectedProperties);
}

function renderPanel(props: Record<string, unknown>) {
  const name = getMunicipalityName(props) ?? "Unnamed municipality";
  const code = getMunicipalityCode(props);
  const province = getMunicipalityProvince(props);

  const identityRows: string[] = [];
  if (code) {
    identityRows.push(`<dt>Code</dt><dd>${escapeHtml(code)}</dd>`);
  }
  if (province) {
    identityRows.push(`<dt>Province</dt><dd>${escapeHtml(province)}</dd>`);
  }

  panel.innerHTML = `
    <h2>${escapeHtml(name)}</h2>
    ${province ? `<p class="province">${escapeHtml(province)}</p>` : ""}
    ${
      identityRows.length
        ? `<section><h3>Identity</h3><dl class="identity-grid">${identityRows.join("")}</dl></section>`
        : ""
    }
  `;

  for (const section of pluginManager.getActivePanelSections(props)) {
    panel.append(section);
  }

  // Attributes/Raw JSON are the underlying source data — useful on their
  // own, but redundant clutter once a plugin is showing its own take on
  // the same municipality.
  if (!pluginManager.hasActivePlugin()) {
    const attrRows = Object.entries(props)
      .map(
        ([key, value]) =>
          `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value ?? ""))}</td></tr>`,
      )
      .join("");

    const rest = document.createElement("div");
    rest.innerHTML = `
      <section>
        <h3>Attributes</h3>
        <table class="attr-table"><tbody>${attrRows}</tbody></table>
      </section>
      <section>
        <h3>Raw JSON</h3>
        <pre>${escapeHtml(JSON.stringify(props, null, 2))}</pre>
      </section>
    `;
    while (rest.firstChild) panel.append(rest.firstChild);
  }

  panel.hidden = false;
}

function showError(message: string) {
  panel.innerHTML = `<p class="panel-error">${escapeHtml(message)}</p>`;
  panel.hidden = false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
