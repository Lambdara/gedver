const { createWriteStream, existsSync } = require("fs");
const { readFile, writeFile } = require("fs").promises;
const https = require("https");
const { resolve } = require("path");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "src/data/.countries-10m-source.json");
const admin1SourcePath = resolve(root, "src/data/.admin1-10m-source.geojson");
const lakesSourcePath = resolve(root, "src/data/.lakes-10m-source.geojson");
const outputPath = resolve(root, "src/data/northwest-europe-10m.json");
const sourceUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json";
const admin1SourceUrl = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const lakesSourceUrl = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson";

const SELECTED_COUNTRIES = new Set(["Germany", "Netherlands"]);
const SELECTED_PROVINCES = new Set([
  "Drenthe",
  "Flevoland",
  "Friesland",
  "Gelderland",
  "Groningen",
  "Limburg",
  "Noord-Brabant",
  "Noord-Holland",
  "Overijssel",
  "Utrecht",
  "Zeeland",
  "Zuid-Holland",
]);
const SELECTED_LAKES = new Set(["IJsselmeer"]);
const REGION_BOUNDS = { minLng: 2.5, minLat: 47, maxLng: 15.6, maxLat: 55.2 };

const DETAIL_LEVELS = [
  { id: "overview", minZoom: 4.4, minPointDelta: 0.035 },
  { id: "regional", minZoom: 5.8, minPointDelta: 0.012 },
  { id: "local", minZoom: 7.2, minPointDelta: 0.004 },
  { id: "fine", minZoom: 9.2, minPointDelta: 0.001 },
];

const LABELS = [
  ["Amsterdam", 52.3676, 4.9041, 4.8, 1],
  ["Berlin", 52.52, 13.405, 4.8, 1],
  ["Hamburg", 53.5511, 9.9937, 5.0, 1],
  ["München", 48.1351, 11.582, 5.0, 1],
  ["Köln", 50.9375, 6.9603, 5.2, 1],
  ["Rotterdam", 51.9244, 4.4777, 5.5, 2],
  ["Den Haag", 52.0705, 4.3007, 5.7, 2],
  ["Utrecht", 52.0907, 5.1214, 5.8, 2],
  ["Frankfurt", 50.1109, 8.6821, 5.3, 2],
  ["Stuttgart", 48.7758, 9.1829, 5.6, 2],
  ["Düsseldorf", 51.2277, 6.7735, 5.6, 2],
  ["Dortmund", 51.5136, 7.4653, 5.8, 2],
  ["Essen", 51.4556, 7.0116, 6.0, 2],
  ["Bremen", 53.0793, 8.8017, 5.8, 2],
  ["Leipzig", 51.3397, 12.3731, 5.8, 2],
  ["Dresden", 51.0504, 13.7373, 6.0, 2],
  ["Hannover", 52.3759, 9.732, 6.0, 2],
  ["Nürnberg", 49.4521, 11.0767, 6.1, 2],
  ["Eindhoven", 51.4416, 5.4697, 6.4, 3],
  ["Groningen", 53.2194, 6.5665, 6.5, 3],
  ["Tilburg", 51.5555, 5.0913, 6.9, 3],
  ["Almere", 52.3508, 5.2647, 7.0, 3],
  ["Breda", 51.5719, 4.7683, 7.0, 3],
  ["Nijmegen", 51.8126, 5.8372, 7.0, 3],
  ["Enschede", 52.2215, 6.8937, 7.0, 3],
  ["Haarlem", 52.3874, 4.6462, 7.1, 3],
  ["Arnhem", 51.9851, 5.8987, 7.1, 3],
  ["Amersfoort", 52.1561, 5.3878, 7.2, 3],
  ["Apeldoorn", 52.2112, 5.9699, 7.3, 3],
  ["Zwolle", 52.5168, 6.083, 7.2, 3],
  ["Leeuwarden", 53.2012, 5.7999, 7.4, 3],
  ["Maastricht", 50.8514, 5.691, 7.2, 3],
  ["Leiden", 52.1601, 4.497, 7.4, 3],
  ["Delft", 52.0116, 4.3571, 7.6, 4],
  ["Duisburg", 51.4344, 6.7623, 6.7, 3],
  ["Bochum", 51.4818, 7.2162, 6.9, 3],
  ["Wuppertal", 51.2562, 7.1508, 7.0, 3],
  ["Bielefeld", 52.0302, 8.5325, 6.9, 3],
  ["Bonn", 50.7374, 7.0982, 6.9, 3],
  ["Münster", 51.9607, 7.6261, 6.8, 3],
  ["Karlsruhe", 49.0069, 8.4037, 6.8, 3],
  ["Mannheim", 49.4875, 8.466, 6.9, 3],
  ["Augsburg", 48.3705, 10.8978, 7.0, 3],
  ["Wiesbaden", 50.0782, 8.2398, 7.0, 3],
  ["Mönchengladbach", 51.1805, 6.4428, 7.2, 3],
  ["Gelsenkirchen", 51.5177, 7.0857, 7.2, 3],
  ["Aachen", 50.7753, 6.0839, 7.0, 3],
  ["Braunschweig", 52.2689, 10.5268, 7.0, 3],
  ["Kiel", 54.3233, 10.1228, 6.9, 3],
  ["Chemnitz", 50.8278, 12.9214, 7.1, 3],
  ["Halle", 51.4969, 11.9688, 7.1, 3],
  ["Magdeburg", 52.1205, 11.6276, 7.1, 3],
  ["Freiburg", 47.999, 7.8421, 7.0, 3],
  ["Krefeld", 51.3388, 6.5853, 7.3, 4],
  ["Lübeck", 53.8655, 10.6866, 7.2, 4],
  ["Oberhausen", 51.4963, 6.8638, 7.4, 4],
  ["Erfurt", 50.9848, 11.0299, 7.1, 3],
  ["Mainz", 50.0, 8.2711, 7.1, 3],
  ["Rostock", 54.0924, 12.0991, 7.1, 3],
  ["Kassel", 51.3127, 9.4797, 7.2, 3],
  ["Hagen", 51.3671, 7.4633, 7.5, 4],
  ["Potsdam", 52.3906, 13.0645, 7.2, 4],
  ["Saarbrücken", 49.2402, 6.9969, 7.2, 3],
  ["Hamm", 51.6739, 7.815, 7.5, 4],
  ["Ludwigshafen", 49.4774, 8.4452, 7.5, 4],
  ["Oldenburg", 53.1435, 8.2146, 7.2, 4],
  ["Osnabrück", 52.2799, 8.0472, 7.2, 4],
  ["Leverkusen", 51.0459, 7.0192, 7.6, 4],
  ["Heidelberg", 49.3988, 8.6724, 7.3, 4],
  ["Darmstadt", 49.8728, 8.6512, 7.4, 4],
  ["Regensburg", 49.0134, 12.1016, 7.3, 4],
  ["Ingolstadt", 48.7665, 11.4258, 7.4, 4],
  ["Würzburg", 49.7913, 9.9534, 7.4, 4],
  ["Wolfsburg", 52.4227, 10.7865, 7.5, 4],
  ["Ulm", 48.4011, 9.9876, 7.4, 4],
  ["Paderborn", 51.7189, 8.7575, 7.5, 4],
  ["Göttingen", 51.5413, 9.9158, 7.5, 4],
  ["Trier", 49.7499, 6.6371, 7.5, 4],
  ["Koblenz", 50.3569, 7.589, 7.4, 4],
  ["Bremerhaven", 53.5396, 8.5809, 7.4, 4],
  ["Erlangen", 49.5897, 11.0119, 7.5, 4],
  ["Siegen", 50.8838, 8.0209, 7.6, 4],
  ["Hildesheim", 52.1548, 9.9579, 7.6, 4],
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await Promise.all([
    ensureSource(sourcePath, sourceUrl),
    ensureSource(admin1SourcePath, admin1SourceUrl),
    ensureSource(lakesSourcePath, lakesSourceUrl),
  ]);
  const topology = JSON.parse(await readFile(sourcePath, "utf8"));
  const admin1GeoJson = JSON.parse(await readFile(admin1SourcePath, "utf8"));
  const lakesGeoJson = JSON.parse(await readFile(lakesSourcePath, "utf8"));
  const arcs = decodeTopoArcs(topology);
  const sourceCountries = [];

  for (const geometry of topology.objects.countries.geometries) {
    const name = geometry.properties && geometry.properties.name;
    if (!SELECTED_COUNTRIES.has(name)) continue;
    for (const polygon of geometryPolygons(geometry, arcs)) {
      if (!bboxIntersects(polygon.bbox, REGION_BOUNDS)) continue;
      sourceCountries.push({ name, rings: polygon.rings, bbox: polygon.bbox });
    }
  }

  const sourceProvinces = geoJsonPolygons(admin1GeoJson.features || [], (feature) => {
    const properties = feature.properties || {};
    return properties.adm0_a3 === "NLD" && SELECTED_PROVINCES.has(properties.name);
  });
  const sourceWater = geoJsonPolygons(lakesGeoJson.features || [], (feature) => {
    const properties = feature.properties || {};
    return SELECTED_LAKES.has(properties.name);
  });

  const levels = DETAIL_LEVELS.map((level) => ({
    id: level.id,
    minZoom: level.minZoom,
    countries: buildLevelCountries(sourceCountries, level.minPointDelta),
    provinces: buildLevelCountries(sourceProvinces, level.minPointDelta),
    water: buildLevelCountries(sourceWater, level.minPointDelta),
  }));

  const output = {
    name: "Netherlands and Germany 10m",
    bbox: bboxForPolygons([...sourceCountries, ...sourceProvinces, ...sourceWater]),
    levels,
    labels: LABELS.map(([name, lat, lng, minZoom, rank]) => ({ name, lat, lng, minZoom, rank })).sort(
      (a, b) => a.rank - b.rank || a.minZoom - b.minZoom || a.name.localeCompare(b.name),
    ),
  };

  await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
  console.log(`${sourceCountries.length} polygons, ${pointCount(sourceCountries)} source points`);
  console.log(`${sourceProvinces.length} province polygons, ${pointCount(sourceProvinces)} source points`);
  console.log(`${sourceWater.length} water polygons, ${pointCount(sourceWater)} source points`);
  for (const level of output.levels) {
    console.log(
      `${level.id}: countries ${pointCount(level.countries)} points, provinces ${pointCount(level.provinces)} points, water ${pointCount(level.water)} points`,
    );
  }
  console.log(`${Buffer.byteLength(JSON.stringify(output))} bytes`);
}

function ensureSource(path, url) {
  if (existsSync(path)) return Promise.resolve();
  return new Promise((resolvePromise, rejectPromise) => {
    const file = createWriteStream(path);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          rejectPromise(new Error(`Could not download map source: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolvePromise);
        });
      })
      .on("error", rejectPromise);
  });
}

function buildLevelCountries(countries, minPointDelta) {
  return countries
    .map((country) => {
      const rings = country.rings.map((ring) => simplifyRing(ring, minPointDelta)).filter((ring) => ring.length >= 4);
      return { name: country.name, rings, bbox: bboxForRings(rings) };
    })
    .filter((country) => Number.isFinite(country.bbox.minLng));
}

function decodeTopoArcs(topology) {
  const scale = topology.transform.scale;
  const translate = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((point) => {
      x += point[0];
      y += point[1];
      return [round(x * scale[0] + translate[0]), round(y * scale[1] + translate[1])];
    });
  });
}

function geometryPolygons(geometry, arcs) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return [polygonFromRings(ringsFromTopology(geometry.arcs, arcs))];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.arcs.map((polygon) => polygonFromRings(ringsFromTopology(polygon, arcs)));
  }
  return [];
}

function geoJsonPolygons(features, predicate) {
  const polygons = [];
  for (const feature of features) {
    if (!predicate(feature)) continue;
    for (const rings of geoJsonGeometryRings(feature.geometry)) {
      const cleanRings = rings.map((ring) => ring.map((coordinate) => [round(coordinate[0]), round(coordinate[1])]));
      polygons.push({
        name: feature.properties && feature.properties.name ? feature.properties.name : "",
        rings: cleanRings,
        bbox: bboxForRings(cleanRings),
      });
    }
  }
  return polygons.filter((polygon) => Number.isFinite(polygon.bbox.minLng));
}

function geoJsonGeometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function ringsFromTopology(rings, arcs) {
  return rings.map((ring) => {
    const coordinates = [];
    for (const arcIndex of ring) {
      const arc = arcCoordinates(arcIndex, arcs);
      const startIndex = coordinates.length ? 1 : 0;
      for (let index = startIndex; index < arc.length; index += 1) {
        coordinates.push(arc[index]);
      }
    }
    return coordinates;
  });
}

function simplifyRing(ring, minPointDelta) {
  if (ring.length <= 4 || minPointDelta <= 0) return ring;
  const closed = pointsEqual(ring[0], ring[ring.length - 1]);
  const end = closed ? ring.length - 1 : ring.length;
  const simplified = [ring[0]];

  for (let index = 1; index < end; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = ring[index];
    if (Math.abs(current[0] - previous[0]) >= minPointDelta || Math.abs(current[1] - previous[1]) >= minPointDelta) {
      simplified.push(current);
    }
  }

  if (!closed) {
    const last = ring[ring.length - 1];
    if (!pointsEqual(simplified[simplified.length - 1], last)) simplified.push(last);
    return simplified.length >= 3 ? simplified : ring;
  }

  if (!pointsEqual(simplified[simplified.length - 1], simplified[0])) simplified.push(simplified[0]);
  return simplified.length >= 4 ? simplified : ring;
}

function polygonFromRings(rings) {
  return {
    rings,
    bbox: bboxForRings(rings),
  };
}

function bboxForPolygons(polygons) {
  return polygons.reduce(
    (bbox, polygon) => mergeBbox(bbox, polygon.bbox),
    { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity },
  );
}

function bboxForRings(rings) {
  return rings.reduce(
    (bbox, ring) =>
      ring.reduce((inner, coordinate) => {
        inner.minLng = Math.min(inner.minLng, coordinate[0]);
        inner.maxLng = Math.max(inner.maxLng, coordinate[0]);
        inner.minLat = Math.min(inner.minLat, coordinate[1]);
        inner.maxLat = Math.max(inner.maxLat, coordinate[1]);
        return inner;
      }, bbox),
    { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity },
  );
}

function mergeBbox(a, b) {
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

function bboxIntersects(a, b) {
  return a.maxLat >= b.minLat && a.minLat <= b.maxLat && a.maxLng >= b.minLng && a.minLng <= b.maxLng;
}

function pointCount(countries) {
  return countries.reduce((count, country) => count + country.rings.reduce((ringCount, ring) => ringCount + ring.length, 0), 0);
}

function arcCoordinates(index, arcs) {
  if (index >= 0) return arcs[index];
  return arcs[~index].slice().reverse();
}

function pointsEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
