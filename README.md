# South Africa Public Data Map — MVP

## Purpose

A minimal local web application that displays official South African local
municipality boundaries on an interactive map. Clicking a municipality
highlights it and shows its name, official identifiers, and the raw
GeoJSON attributes supplied by the source dataset. This is a technical
prototype for proving the map → geographic entity → data interaction
before any larger data platform is built.

## Data source

Municipal boundary data comes from the Municipal Demarcation Board (MDB),
the authoritative South African body for municipal boundaries, served via
the DFFE GIS portal:

https://dffeportal.environment.gov.za/hosting/rest/services/MDB_Boundaries/LocalMunicipalities/MapServer

Provincial outlines, shown for visual context only (they are not a
clickable entity in this MVP), come from the sibling service:

https://dffeportal.environment.gov.za/hosting/rest/services/MDB_Boundaries/Provinces/MapServer

This is an independent prototype using public government geographic data.
It is not an official government application.

Municipal budget figures (used by the "Staff cost ratio" plugin) are
fetched live, at plugin-activation time, from National Treasury's
Municipal Money API:

https://municipaldata.treasury.gov.za/api/cubes/incexp_v2

Unlike the boundary geometry, this data is not bundled locally — it's
public, CORS-enabled, and updated quarterly by Treasury, so the plugin
always reflects the current published figures rather than a static
snapshot.

## Running locally

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

## Data update

`data/municipalities.geojson` (213 features: 209 local municipalities plus
4 metros published as multipolygons on the same layer) was obtained from
layer 0 of the MapServer above via its query endpoint:

```text
https://dffeportal.environment.gov.za/hosting/rest/services/MDB_Boundaries/LocalMunicipalities/MapServer/0/query
  ?where=1=1
  &outFields=*
  &outSR=4326
  &f=geojson
  &maxAllowableOffset=0.0005
```

The full-resolution geometry from this service is very dense (one metro
polygon alone is ~800 KB), so `maxAllowableOffset=0.0005` (~55 m) was used
to ask the server to generalize the same official geometry to a lighter
vertex count — this is a server-side resampling of the authoritative
boundary, not a manually redrawn approximation. It brought the dataset
from ~47 MB down to ~1.8 MB, which is appropriate for boundaries viewed at
national/provincial scale. All 213 official records and their full
original properties are retained.

The service caps how much geometry it will return per request, so the
data was fetched in pages of 20 features (`resultOffset` /
`resultRecordCount`) and merged into one `FeatureCollection`.

To refresh with a newer dataset, or to get full-resolution geometry,
re-run the same query (dropping `maxAllowableOffset` for full resolution)
and overwrite `data/municipalities.geojson` with the merged result.

`data/provinces.geojson` (9 features) was obtained the same way from the
`Provinces` service's layer 0, in a single request (small enough not to
need pagination):

```text
https://dffeportal.environment.gov.za/hosting/rest/services/MDB_Boundaries/Provinces/MapServer/0/query
  ?where=1=1
  &outFields=*
  &outSR=4326
  &f=geojson
  &maxAllowableOffset=0.0005
```

The same generalization tolerance was used for consistency with the
municipal boundaries (full resolution was ~2.8 MB for a single province).

## Plugins

The map supports small, independently-written "plugins" (`src/plugins/`)
that can be toggled on/off, each with their own config UI and (optionally)
their own section in the municipality info panel. Only one "coloring"
plugin (one that recolors municipalities) can be active at a time — the
plugin manager (`src/plugins/core.ts`) enforces this automatically. See
[PLUGIN_GUIDE.md](PLUGIN_GUIDE.md) for how to write and register a new
one.

**Highlight province** — greys out every municipality outside the
selected province(s), sourced from `data/provinces.geojson`.

**Staff cost ratio** — colors municipalities by employee-related costs as
a share of total operating expenditure, using National Treasury's FY2025
Original Budget figures (`src/plugins/budget.ts`). Treasury's API stores
budget "Total Expenditure" as a set of underlying line items rather than a
single fact row, so the plugin sums the relevant mSCOA item codes itself
(see the comments in that file for the specifics). Color thresholds are
fixed in code, not user-configurable.

**Budget vs actual** — colors municipalities by how far actual spending
deviated from the Original Budget for a selected year, and lists the
municipality's 3 biggest line-item deviations in the info panel
(`src/plugins/budget-vs-actual.ts`). Its config box toggles which
"actual" figure to compare against (Audited Actual, Pre-audit, or
Restructured Audit — Treasury's `ACT`, in-year actual, turned out to have
no data at all in this cube), and a year slider in a bottom bar (the
first plugin-contributed UI outside the checkbox+config box, via the
optional `renderControls` hook) picks the financial year. Both fetches
race-guard against the slider being dragged again before the previous
request resolves.
