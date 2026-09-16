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
