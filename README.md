# Gedver

Gedver is an offline-first GEDCOM 5.5.1 lineage visualizer. It reads a local GEDCOM file in the browser, extracts birth, baptism, marriage, death and other facts, and plots event locations on a zoomable map.

## Build

```sh
npm run build
```

The build writes `dist/gedver.html`. Open that file directly in a browser; no local server is needed.

## Coordinates

GEDCOM places are names, so Gedver needs coordinates for map markers. Add them in the UI or import a JSON/CSV file. Coordinates are stored in browser local storage and can be exported again. Click a place marker to view and edit its latitude and longitude in the right panel; save with Enter or the Update button. Clicking keeps that place selected while you move the mouse and scroll through its facts.

Places with identical coordinates share one map marker and a title with their names separated by `/`. Each fact retains its original place name. Editing coordinates in this shared view updates all displayed aliases; the coordinate list still lets you edit each place separately.

The right panel groups facts by person. Facts in the selected place are highlighted; facts elsewhere are dark gray. People are sorted by their newest fact in the selected place, and each person’s facts are sorted newest first, with undated facts last. Surnames appear in capitals and partial dates show only the known year or month and year.

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

The page includes a built-in offline vector basemap covering the Netherlands, Germany, the United Kingdom, Belgium and Luxembourg, with zoom-adaptive borders and major city labels. All parsing, filtering, saved coordinates, zooming, panning, and markers work without network access.
