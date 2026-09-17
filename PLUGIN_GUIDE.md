# Writing a plugin

This app supports small, independently-written plugins that live in
`src/plugins/`. Each one shows up as a checkbox in the "Plugins" box, can
own its own config UI, and can optionally contribute:

- a color for every municipality on the map,
- a section in the municipality info panel (right under the identity
  header, when a municipality is selected), and/or
- controls in a shared bar fixed to the bottom of the map (e.g. a year
  slider).

This guide walks through the plugin contract and how to wire a new one
in, using the three existing plugins as worked examples.

## The three existing plugins, as a difficulty ladder

- **`province-highlight.ts`** — simplest. Categorical, config-only (a
  list of checkboxes), no network fetch, no panel content.
- **`budget.ts`** — adds an async data fetch (National Treasury API),
  in-memory caching, a legend, and a panel section.
- **`budget-vs-actual.ts`** — most advanced. Two parallel fetches, a
  dropdown *and* a bottom-bar year slider, and a race-safe reload pattern
  for when the user changes a control before the previous fetch finishes.

Read whichever one is closest to what you're building before starting —
copying the shape of an existing plugin is usually faster than starting
from the interface alone.

## 1. The `MapPlugin` interface

Every plugin is a plain object matching this shape (defined in
`src/plugins/core.ts`):

```ts
export type PluginCategory = "coloring";

export interface MapPlugin {
  id: string;
  name: string;
  category: PluginCategory;
  onActivate(): void;
  onDeactivate(): void;
  renderConfig(container: HTMLElement): void;
  renderPanel?(container: HTMLElement, properties: Record<string, unknown>): void;
  renderControls?(container: HTMLElement): void;
}
```

| Field | Required | Called when | Purpose |
|---|---|---|---|
| `id` | yes | — | Unique string. Used internally to track active/inactive state. |
| `name` | yes | — | Label shown next to the checkbox. |
| `category` | yes | — | Currently only `"coloring"` exists. Plugins in the same category are mutually exclusive — checking one unchecks any other active plugin in that category, because they'd otherwise fight over the map's fill-color. If you're building something that *doesn't* touch the map's colors (e.g. a pure info panel), see [Adding a new category](#adding-a-new-category-non-coloring-plugins) below. |
| `onActivate()` | yes | The checkbox is checked | Start whatever the plugin needs (fetch data, apply a color, etc). |
| `onDeactivate()` | yes | The checkbox is unchecked, or another plugin in the same category is activated | Clean up / reset (e.g. clear map colors back to default). |
| `renderConfig(container)` | yes | Every time the plugin is activated | Build the plugin's own config UI (legend, dropdown, checkboxes...) into `container`. The manager clears `container` before calling this, so you don't need to. |
| `renderPanel(container, properties)` | no | A municipality is clicked, for every currently-active plugin that defines this | Add a section to the info panel. `properties` is the raw GeoJSON feature properties for the clicked municipality — use the helpers in `src/municipality.ts` to read them (see below), don't assume a specific field name. |
| `renderControls(container)` | no | The plugin is activated, if it defines this | Render into the shared bottom bar (`#plugin-controls`). The bar is shown automatically while this plugin owns it and hidden again on deactivate. Only relevant for controls that don't fit in the small 200px config box, e.g. a slider. |

## 2. Create the plugin file

Add a new file under `src/plugins/`, e.g. `src/plugins/my-plugin.ts`.
Export a factory function that builds and returns a `MapPlugin`. A
factory (not a plain object) is the pattern used throughout — it lets
the plugin close over its own private state (selection, cached data,
loading flags) without leaking it.

Minimal example — a plugin with no map coloring, just a static panel
note:

```ts
// src/plugins/hello.ts
import type { MapPlugin } from "./core";

export function createHelloPlugin(): MapPlugin {
  return {
    id: "hello",
    name: "Hello",
    category: "coloring", // see note on categories below
    onActivate() {},
    onDeactivate() {},
    renderConfig(container) {
      const p = document.createElement("p");
      p.textContent = "This plugin doesn't do much yet.";
      container.append(p);
    },
    renderPanel(container, properties) {
      const p = document.createElement("p");
      p.textContent = `Hello, ${properties.MUNICNAME ?? "municipality"}.`;
      container.append(p);
    },
  };
}
```

Even though this example doesn't color the map, it's still declared as
`category: "coloring"` here because that's the only category that exists
today. See [Adding a new category](#adding-a-new-category-non-coloring-plugins)
if you want it to run alongside another active plugin instead of being
mutually exclusive with it.

## 3. Export it from the barrel

Add your factory to `src/plugins/index.ts`:

```ts
export { createHelloPlugin } from "./hello";
```

## 4. Register it in `main.ts`

Inside the `map.on("load", ...)` handler in `src/main.ts`, register your
plugin with `pluginManager.register(...)` *before* the
`pluginManager.mount(pluginsList, pluginControls)` call at the end of
that handler (registration order determines the order plugins appear in
the list):

```ts
pluginManager.register(createHelloPlugin());
```

That's it for a non-coloring, no-fetch plugin. For a coloring plugin, see
the next section.

## 5. Coloring the map

If your plugin should recolor municipalities, it needs to produce a
`Map<string, string> | null` — official municipality code → CSS color, or
`null` to clear back to the default look — and hand it to
`main.ts`'s `applyColorOverride`. `main.ts` owns the actual MapLibre
paint-property logic (selected/hover states always take visual priority
over whatever a plugin assigns); plugins never touch the map directly.

The wiring looks like this at the registration call site:

```ts
pluginManager.register(
  createMyColoringPlugin((colorByCode) => applyColorOverride(colorByCode)),
);
```

...and inside the plugin, call that callback whenever the coloring
should change (on activate, on deactivate with `null`, or whenever a
config control changes):

```ts
export function createMyColoringPlugin(
  setColors: (colorByCode: Map<string, string> | null) => void,
): MapPlugin {
  return {
    id: "my-coloring-plugin",
    name: "My coloring plugin",
    category: "coloring",
    onActivate() {
      const colors = new Map<string, string>();
      colors.set("WC032", "#4f8f72");
      // ... one entry per municipality you want colored;
      // codes you omit fall back to a neutral grey automatically.
      setColors(colors);
    },
    onDeactivate() {
      setColors(null);
    },
    renderConfig(container) {
      /* ... */
    },
  };
}
```

Look at `province-highlight.ts` (categorical: municipalities either match
a selected province or don't) and `budget.ts` (continuous: a numeric
ratio mapped through fixed color bands) for two different real shapes of
this pattern.

### Getting the municipality's official code

Never read a hardcoded property name like `CAT_B` directly in plugin
code — the source dataset's exact field name isn't guaranteed to stay
the same. Use the shared helpers in `src/municipality.ts`:

```ts
import { getMunicipalityCode, getMunicipalityName, getMunicipalityProvince } from "../municipality";

const code = getMunicipalityCode(properties); // e.g. "WC032"
```

These are what `renderPanel(container, properties)` should use to key
into your plugin's own data.

## 6. Fetching your own data

If your plugin needs data beyond what's already in the municipality
GeoJSON (an external API, a bundled dataset, whatever), fetch it lazily
— on first activation, not at page load — and cache the result in the
factory's closure so re-activating doesn't refetch. `budget.ts` is the
reference implementation of this pattern.

**The bug to avoid** (hit twice while building the existing plugins):
more than one call site can want to know when a load finishes —
typically `onActivate` (to color the map) and `renderConfig` (to update
the config UI once loading is done). If your "start loading" function
bails out early whenever a fetch is already in flight, and only remembers
the *first* caller's callback, the second caller's UI update gets
silently dropped and gets stuck showing "Loading…" forever even though
the data arrived fine.

The fix is to always queue every caller's callback, and only actually
start a network request if one isn't already running:

```ts
let data: MyData | null = null;
let loading = false;
const pendingListeners: Array<() => void> = [];

function ensureLoaded(onDone: () => void) {
  if (data) { onDone(); return; }
  pendingListeners.push(onDone);
  if (loading) return; // already fetching — just wait for it
  loading = true;
  void fetchMyData()
    .then((result) => { data = result; })
    .finally(() => {
      loading = false;
      const listeners = pendingListeners.splice(0);
      for (const listener of listeners) listener();
    });
}
```

If a control (dropdown, slider) should force a *fresh* fetch even when
data is already cached, add a second function that always starts a new
request, and — if the control can change quickly (a slider being
dragged) — guard against a slow old response overwriting a newer one
with an incrementing token, the way `budget-vs-actual.ts` does:

```ts
let loadToken = 0;

function forceReload(onDone: () => void) {
  pendingListeners.push(onDone);
  const token = ++loadToken;
  loading = true;
  void fetchMyData()
    .then((result) => {
      if (token !== loadToken) return; // superseded by a newer request
      data = result;
    })
    .finally(() => {
      if (token === loadToken) {
        loading = false;
        const listeners = pendingListeners.splice(0);
        for (const listener of listeners) listener();
      }
    });
}
```

## 7. Bottom-bar controls

Only needed for controls too large for the config box (the year slider
in `budget-vs-actual.ts` is the only current example). Define
`renderControls(container)` and the manager shows/hides the shared bar
automatically on activate/deactivate — you don't need to touch
`#plugin-controls` directly, and you don't need to guard against another
plugin's controls being present, since only one plugin can own the bar
at a time (enforced by the same category exclusivity as coloring).

## 8. Reusable CSS classes

Reuse these rather than inventing near-duplicates — they already match
the app's visual language (see `src/style.css` for the full rules):

| Class | Use for |
|---|---|
| `.plugin-field` | A labeled control row in the config box (see the dropdown in `budget-vs-actual.ts`). |
| `.plugin-legend` / `.plugin-legend-swatch` | A color-key list — swatch + label per row. |
| `.plugin-error` | Error text (red) inside the config box. |
| `.plugin-province-list` | A scrollable checkbox list in the config box. |
| `.identity-grid` | A label/value `<dl>` grid — used for the panel's Identity section and both budget plugins' figures. |
| `.deviation-list` / `.deviation-name` / `.deviation-amount` | A label + right-aligned value list row (see "Biggest deviations" in `budget-vs-actual.ts`). |
| `.year-slider` / `.year-slider-label` | Layout for a `renderControls` slider + its live label. |
| `.panel-plugin-section h4` | A sub-heading inside a panel section (the main section heading is a plain `<h3>`, added by your `renderPanel` code). |

Color choices should stay restrained (muted, not neon) and, for anything
diverging (over/under, good/bad), avoid implying a value judgement in the
color itself unless the metric genuinely has an agreed "good" direction
— see `budget-vs-actual.ts`'s comment on this for the reasoning.

## 9. Conventions worth following

- **Thresholds, color bands, and similar tuning constants are fixed in
  code, not exposed as user-configurable UI**, unless there's a specific
  reason for a control (like the year/actual-type toggles). This keeps
  the config boxes small and matches how the existing plugins were
  deliberately scoped.
- **Don't invent identifiers or field values.** If you need a
  human-readable label for a code your data source gives you (e.g. an
  item code, a category code), source the label from the same official
  dataset rather than guessing — see the `ITEM_LABELS` map in
  `budget-vs-actual.ts` for how that was sourced from Treasury's own
  metadata.
- **Never hardcode a GeoJSON property name in plugin JS.** Use
  `src/municipality.ts`'s helpers. (The one narrow exception is inside a
  MapLibre *style expression* itself, in `main.ts`'s
  `buildFillColorExpr` — those run against the raw GeoJSON and can't call
  JS functions, so the literal field name `"CAT_B"` is used there
  directly, with a comment explaining why.)

## 10. Testing your plugin

There's no test suite — verify by running the app and driving it:

```bash
npm run dev
```

Then, in a browser (or via a Playwright script, if you don't have a
browser handy in your environment):

1. Confirm your plugin's checkbox appears in the Plugins box.
2. Check it — confirm the config box (and bottom bar, if you use one)
   renders correctly, and the map colors update if applicable.
3. Click a municipality — confirm your panel section (if any) appears
   right under the Identity section, above Attributes.
4. If you're a `"coloring"` plugin, activate a *different* coloring
   plugin and confirm yours automatically deactivates (and vice versa).
5. Uncheck your plugin — confirm the map and panel both cleanly reset,
   and the bottom bar (if used) hides again.
6. Check the browser console for errors — a stuck "Loading…" state
   that never resolves usually means the pending-listeners bug described
   in section 6.

## Adding a new category (non-coloring plugins)

Everything above assumes `category: "coloring"`. If you're building a
plugin that only contributes panel content (e.g. a rich per-municipality
financial profile) and shouldn't fight with the active coloring plugin
for exclusivity, add a new value to the `PluginCategory` union in
`src/plugins/core.ts`:

```ts
export type PluginCategory = "coloring" | "panel";
```

The exclusivity check in `PluginManager.activate()` only deactivates
other plugins *in the same category*, so a `"panel"` plugin will happily
run alongside whichever `"coloring"` plugin (if any) is active, and won't
be affected by coloring plugins switching in and out.
