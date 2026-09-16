# South Africa Public Data Map — Minimal MVP

## 1. Objective

Build a minimal local web application that displays the official South African municipal boundaries on an interactive map.

The purpose of this MVP is to prove one fundamental interaction:

> A user can see South Africa divided into municipalities, click a municipality, see its boundary highlighted, and inspect the JSON data associated with that geographic entity.

This is a technical prototype only.

Do **not** build the future data platform, financial analysis system, plugin framework, authentication, database, or production infrastructure at this stage.

---

# 2. Required user experience

When the application opens:

1. Display a map of South Africa.
2. Display all available local municipality boundaries.
3. The map should initially be positioned so that South Africa is comfortably visible.
4. Municipal boundaries should be visually clear but not dominate the map.
5. The user can pan and zoom normally.
6. Hovering over a municipality should provide a subtle visual indication.
7. Clicking a municipality should:
   - highlight that municipality;
   - identify the municipality by name;
   - display its available properties/attributes;
   - display the actual JSON object for that municipality.

Example:

```text
┌──────────────────────────────────┐
│ OVERSTRAND MUNICIPALITY          │
│ Western Cape                     │
│                                  │
│ Code: WC032                      │
│                                  │
│ JSON                             │
│ {                                │
│   "name": "Overstrand",          │
│   "code": "WC032",               │
│   ...                            │
│ }                                │
└──────────────────────────────────┘
```

The JSON display is intentionally included in this MVP.

It will allow us to inspect exactly what information the geographic dataset provides and will help define the future entity model.

---

# 3. Technology

Use:

- Vite
- JavaScript or TypeScript
- MapLibre GL JS
- GeoJSON for the municipal boundary data

Prefer TypeScript if there is no significant additional complexity.

Do not introduce a frontend framework such as React unless there is a compelling reason.

The initial application should be as simple as possible.

---

# 4. Data source

Use an official South African government source for the municipal boundaries.

The preferred source is the Municipal Demarcation Board (MDB), which is the authoritative body responsible for municipal boundaries.

A suitable government GIS service has been identified:

DFFE MDB Local Municipalities GIS service:

https://dffeportal.environment.gov.za/hosting/rest/services/MDB_Boundaries/LocalMunicipalities/MapServer

The service exposes local municipality polygon data and supports GeoJSON.

The agent should inspect the service and determine the appropriate layer/query endpoint.

Do not permanently depend on the remote service for the application.

For the MVP, obtain the official municipal geometries and save a local copy as:

```text
data/municipalities.geojson
```

The application should load the local GeoJSON.

This means the application continues to work without access to the government GIS service after the data has been obtained.

---

# 5. Data requirements

The GeoJSON should retain the useful original attributes supplied by the official dataset.

Do not aggressively simplify the properties at this stage.

We want to inspect what the official data actually provides.

At minimum, determine which attributes identify:

- municipality name
- municipality code / identifier
- province
- district municipality
- any other official identifiers supplied by the source

Preserve the original source attributes wherever practical.

Do not invent identifiers.

If the source provides multiple identifiers, retain them.

---

# 6. Geometry

Use polygon/multipolygon geometry supplied by the official source.

Do not draw or approximate municipal boundaries manually.

Do not use election wards.

Do not add voting districts.

Do not add provincial boundaries unless they are already useful from the base map.

The geographic scope of this MVP is:

> South African local municipalities.

---

# 7. Map

Use MapLibre GL JS.

The map should provide:

- pan
- zoom
- municipality polygon rendering
- municipality boundary lines
- hover state
- selected municipality state

The base map may use an appropriate public/open map source.

Do not spend significant development time creating a custom basemap.

The municipal polygons are the important part.

---

# 8. Interaction

## Hover

When the pointer is over a municipality:

- subtly change its appearance;
- optionally display the municipality name.

Do not require hover for essential information.

## Click

When a municipality is clicked:

1. Set it as the selected municipality.
2. Highlight its polygon.
3. Display a side panel or information card.
4. Show the municipality's human-readable name.
5. Show its attributes.
6. Show the raw JSON representation of the GeoJSON feature.

Clicking another municipality should immediately replace the selection.

Clicking empty map space may clear the selection.

---

# 9. Information panel

The panel should contain three sections.

### Identity

Example:

```text
Municipality
Overstrand

Code
WC032

Province
Western Cape
```

Only display fields that actually exist in the source data.

### Attributes

Display all useful non-geometric properties in a readable key/value format.

### Raw JSON

Display the selected GeoJSON feature or its `properties` object as formatted JSON.

Use syntax highlighting if trivial to implement, but do not introduce a large code-editor dependency merely for this.

A normal `<pre>` element is sufficient.

---

# 10. Visual design

The application should feel like the beginning of a serious data platform rather than a GIS demonstration.

Use:

- clean typography
- restrained colours
- clear municipal boundaries
- subtle hover state
- obvious selected state
- uncluttered interface

Avoid:

- military/command-centre styling
- unnecessary 3D
- excessive animations
- glowing interfaces
- excessive gradients
- dashboard widgets
- charts
- fake "intelligence" aesthetics

The inspiration is an interactive geographic information interface, not a simulation of a military command system.

---

# 11. Project structure

Prefer something approximately like:

```text
sa-public-map/
│
├── index.html
├── package.json
├── vite.config.*
│
├── src/
│   ├── main.*
│   └── style.*
│
├── data/
│   └── municipalities.geojson
│
└── README.md
```

Keep the project structure simple.

Do not create abstractions for future functionality unless they are genuinely useful to the current MVP.

---

# 12. No backend

The MVP must run entirely in the browser.

There should be:

- no server-side API;
- no database;
- no authentication;
- no Docker requirement;
- no cloud infrastructure;
- no user accounts.

The only local data dependency should initially be the GeoJSON file.

---

# 13. No plugin system yet

Do not implement a plugin architecture.

However, write the code cleanly enough that the future application could eventually separate:

```text
map
data
entities
visualisation
UI
```

Do not build interfaces or abstractions for hypothetical plugins yet.

The first real plugin architecture should be designed after we have built at least one real data layer.

---

# 14. No financial data yet

Do not import National Treasury data.

Do not calculate financial ratios.

Do not create municipality scores.

Do not perform anomaly detection.

Do not add charts.

The only data shown in this MVP is the municipal geographic dataset and its supplied properties.

---

# 15. Important data behaviour

The application must use the municipality's official identifier as the geographic entity identity.

Conceptually:

```text
Map polygon
     ↓
GeoJSON feature
     ↓
official municipality identifier
     ↓
selected municipality
```

Do not use the municipality name as the primary identity if the official dataset provides a stable code.

The name is a display property.

The identifier is the entity key.

---

# 16. Data provenance

The application should display or make accessible somewhere small but clear:

```text
Municipal boundary data:
Municipal Demarcation Board / South African government GIS data
```

Include the source URL in the README.

Do not claim that the application itself is an official government application.

Make clear that this is an independent prototype using public government geographic data.

---

# 17. README

Create a README containing:

## Purpose

One paragraph describing the MVP.

## Data source

Explain where the municipal boundary data came from.

Include the source URL.

## Running locally

Document:

```bash
npm install
npm run dev
```

and any other required commands.

## Building

Document:

```bash
npm run build
```

## Data update

Briefly explain how `data/municipalities.geojson` was obtained and how it could be replaced with a newer official dataset.

---

# 18. Acceptance criteria

The MVP is complete when all of the following work:

- [ ] Application starts locally with Vite.
- [ ] Map displays South Africa.
- [ ] Municipal polygons are visible.
- [ ] Municipal polygons come from official published geographic data.
- [ ] GeoJSON is stored locally.
- [ ] User can zoom.
- [ ] User can pan.
- [ ] User can hover over municipalities.
- [ ] User can click a municipality.
- [ ] Selected municipality is visually highlighted.
- [ ] Municipality name is displayed.
- [ ] Municipality identifier is displayed where available.
- [ ] Source attributes are displayed.
- [ ] Raw JSON is displayed.
- [ ] Clicking another municipality changes the selection.
- [ ] Application works without querying the government GIS service at runtime.
- [ ] `npm run build` succeeds.
- [ ] README explains installation, operation and data provenance.

---

# 19. Explicit non-goals

Do NOT implement:

- PostGIS
- SQLite
- backend API
- authentication
- user accounts
- plugin architecture
- financial data
- Treasury integration
- IEC integration
- election data
- ward boundaries
- procurement data
- supplier data
- infrastructure data
- analytics
- anomaly detection
- AI
- user-generated content
- deployment infrastructure
- automated data refresh
- mobile application

These belong to later experiments.

---

# 20. Definition of success

The most important test is not technical.

After starting the application, a person should be able to:

> Look at South Africa → see the municipalities → click one → immediately understand which geographic entity they selected and inspect the data describing it.

If that interaction feels natural and satisfying, the MVP has succeeded.

Do not expand the scope simply because additional functionality is easy to add.

The purpose of this exercise is to prove the **map → geographic entity → data** interaction before building anything else.
