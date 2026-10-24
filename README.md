# Gedver

Gedver is an offline-first GEDCOM 5.5.1 lineage visualizer. It reads a local GEDCOM file in the browser, extracts birth, marriage, and death events, and plots event locations on a zoomable map.

## Build

```sh
npm run build
```

The build writes `dist/gedver.html`. Open that file directly in a browser; no local server is needed.

Surnames appear in capitals and slash-separated name variants are preserved.

## Coordinates

GEDCOM places are names, so Gedver needs coordinates for map markers. Add them in the UI or import a JSON/CSV file. Coordinates are stored in browser local storage and can be exported again.

JSON object format:

```json
{
  "Example place": { "lat": 52.1, "lng": 5.1 }
}
```

CSV format:

```csv
place,lat,lng
Example place,52.1,5.1
```

Private GEDCOM files and local coordinate tables are ignored by `.gitignore`.

## Offline map

The page includes a built-in offline vector basemap focused on the Netherlands and Germany, with zoom-adaptive borders and major city labels. All parsing, filtering, saved coordinates, zooming, panning, and markers work without network access.
