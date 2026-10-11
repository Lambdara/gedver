# Basemap Data

`northwest-europe-10m.json` is a generated regional detail pack derived from the `world-atlas` 1:10m countries TopoJSON dataset. It contains European Netherlands and Germany country geometry at several precomputed detail levels plus built-in major city labels, so the app can zoom into the Netherlands/Germany area without embedding or rendering the full 10m world map.

To regenerate the regional pack during development:

```sh
node scripts/build-regional-map.js
```

The generator downloads the full 10m source into an ignored local cache if needed.

Natural Earth map data is public domain. See:

- https://www.naturalearthdata.com/about/terms-of-use/
- https://github.com/topojson/world-atlas
