(function gedverApp() {
  "use strict";

  const Core = window.GedverCore;
  const MapData = window.GedverMapData;
  const STORAGE_KEY = "gedver.locations.v1";
  const TILE_SIZE = 256;
  const MIN_ZOOM = 4.4;
  const MAX_ZOOM = 19;
  const DEFAULT_VIEW = { centerLat: 51.45, centerLng: 8.8, zoom: 5.6 };

  const state = {
    data: null,
    fileName: "",
    probandId: "",
    ancestryOnly: true,
    filters: {
      birth: true,
      marriage: true,
      death: true,
    },
    colorMode: "single",
    singleColor: "#d7263d",
    locations: loadStoredLocations(),
    groups: [],
    visibleEvents: [],
    selectedPlace: "",
    placeListMode: "unmapped",
    view: { ...DEFAULT_VIEW },
    dragging: null,
    basemap: buildMapData(MapData),
  };

  const el = {
    statusLine: byId("statusLine"),
    gedcomFile: byId("gedcomFile"),
    locationFile: byId("locationFile"),
    exportLocations: byId("exportLocations"),
    probandSelect: byId("probandSelect"),
    ancestryOnly: byId("ancestryOnly"),
    filterBirth: byId("filterBirth"),
    filterMarriage: byId("filterMarriage"),
    filterDeath: byId("filterDeath"),
    colorLegend: byId("colorLegend"),
    colorLegendTitle: byId("colorLegendTitle"),
    colorLegendRamp: byId("colorLegendRamp"),
    colorLegendMin: byId("colorLegendMin"),
    colorLegendMax: byId("colorLegendMax"),
    colorLegendNote: byId("colorLegendNote"),
    peopleCount: byId("peopleCount"),
    eventCount: byId("eventCount"),
    mappedCount: byId("mappedCount"),
    unmappedCount: byId("unmappedCount"),
    eventBreakdown: byId("eventBreakdown"),
    missingLocationNotice: byId("missingLocationNotice"),
    showUnmapped: byId("showUnmapped"),
    showMapped: byId("showMapped"),
    clearLocations: byId("clearLocations"),
    placeList: byId("placeList"),
    mapViewport: byId("mapViewport"),
    offlineLayer: byId("offlineLayer"),
    markerLayer: byId("markerLayer"),
    mapEmpty: byId("mapEmpty"),
    zoomIn: byId("zoomIn"),
    zoomOut: byId("zoomOut"),
    fitMap: byId("fitMap"),
    selectedPlaceTitle: byId("selectedPlaceTitle"),
    selectedPlaceMeta: byId("selectedPlaceMeta"),
    eventList: byId("eventList"),
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function init() {
    el.gedcomFile.addEventListener("change", onGedcomFile);
    el.locationFile.addEventListener("change", onLocationFile);
    el.exportLocations.addEventListener("click", exportLocations);
    el.probandSelect.addEventListener("change", () => {
      state.probandId = el.probandSelect.value;
      recalculate(true);
    });
    el.ancestryOnly.addEventListener("change", () => {
      state.ancestryOnly = el.ancestryOnly.checked;
      recalculate(true);
    });
    el.filterBirth.addEventListener("change", updateFilters);
    el.filterMarriage.addEventListener("change", updateFilters);
    el.filterDeath.addEventListener("change", updateFilters);
    document.querySelectorAll("input[name='colorMode']").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) {
          state.colorMode = input.value;
          renderColorLegend();
          renderMap();
        }
      });
    });
    el.showUnmapped.addEventListener("click", () => {
      state.placeListMode = "unmapped";
      renderPlaceList();
    });
    el.showMapped.addEventListener("click", () => {
      state.placeListMode = "mapped";
      renderPlaceList();
    });
    el.clearLocations.addEventListener("click", clearLocations);
    el.zoomIn.addEventListener("click", () => zoomBy(1));
    el.zoomOut.addEventListener("click", () => zoomBy(-1));
    el.fitMap.addEventListener("click", fitToMarkers);

    el.mapViewport.addEventListener("pointerdown", onPointerDown);
    el.mapViewport.addEventListener("pointermove", onPointerMove);
    el.mapViewport.addEventListener("pointerup", onPointerUp);
    el.mapViewport.addEventListener("pointercancel", onPointerUp);
    el.mapViewport.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", debounce(() => renderMap(), 100));

    renderAll();
  }

  function onGedcomFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state.data = Core.parseGedcom(String(reader.result || ""));
        state.fileName = file.name;
        state.selectedPlace = "";
        populateProbandSelect();
        recalculate(true);
      } catch (error) {
        showStatus(`Could not read ${file.name}: ${error.message}`);
      }
    };
    reader.onerror = () => showStatus(`Could not read ${file.name}`);
    reader.readAsText(file, "UTF-8");
  }

  function onLocationFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseLocationImport(String(reader.result || ""), file.name);
        state.locations = { ...state.locations, ...imported };
        saveStoredLocations(state.locations);
        recalculate(true);
        showStatus(`Imported ${Object.keys(imported).length} coordinate rows from ${file.name}`);
      } catch (error) {
        showStatus(`Could not import ${file.name}: ${error.message}`);
      } finally {
        el.locationFile.value = "";
      }
    };
    reader.onerror = () => showStatus(`Could not read ${file.name}`);
    reader.readAsText(file, "UTF-8");
  }

  function populateProbandSelect() {
    el.probandSelect.innerHTML = "";
    if (!state.data || state.data.individuals.size === 0) {
      el.probandSelect.disabled = true;
      el.probandSelect.append(new Option("No proband candidates found", ""));
      state.probandId = "";
      return;
    }

    const people = Array.from(state.data.individuals.values()).sort((a, b) => {
      const nameCompare = a.name.display.localeCompare(b.name.display);
      return nameCompare || a.id.localeCompare(b.id);
    });

    for (const person of people) {
      el.probandSelect.append(new Option(`${person.name.display} (${person.id})`, individualProbandValue(person.id)));
    }

    const normalizedSelection = normalizeProbandSelection(state.probandId);
    state.probandId = normalizedSelection || individualProbandValue(people[0].id);
    el.probandSelect.value = state.probandId;
    el.probandSelect.disabled = false;
  }

  function individualProbandValue(id) {
    return `INDI:${id}`;
  }

  function parseProbandValue(value) {
    const raw = String(value || "");
    const match = raw.match(/^INDI:(.*)$/);
    if (match) return { type: "INDI", id: match[1] };
    return { type: "INDI", id: raw };
  }

  function normalizeProbandSelection(value) {
    if (!state.data || !value) return "";
    const parsed = parseProbandValue(value);
    if (parsed.type === "INDI" && state.data.individuals.has(parsed.id)) {
      return individualProbandValue(parsed.id);
    }
    return "";
  }

  function selectedIndividualProbandId() {
    if (!state.data) return "";
    const parsed = parseProbandValue(state.probandId);
    if (parsed.type === "INDI") {
      return state.data.individuals.has(parsed.id) ? parsed.id : "";
    }
    return "";
  }

  function selectedProbandLabel() {
    if (!state.data) return "";
    const parsed = parseProbandValue(state.probandId);
    if (parsed.type === "INDI") {
      const person = state.data.individuals.get(parsed.id);
      return person ? person.name.display : "";
    }
    return "";
  }

  function updateFilters() {
    state.filters.birth = el.filterBirth.checked;
    state.filters.marriage = el.filterMarriage.checked;
    state.filters.death = el.filterDeath.checked;
    recalculate(false);
  }

  function recalculate(shouldFit) {
    if (!state.data) {
      state.visibleEvents = [];
      state.groups = [];
      renderAll();
      return;
    }

    const probandIndividualId = selectedIndividualProbandId();
    const result = Core.extractEvents(state.data, {
      ...state.filters,
      ancestryOnly: state.ancestryOnly && Boolean(probandIndividualId),
      probandId: probandIndividualId,
    });
    state.visibleEvents = result.events;
    state.groups = Core.groupEventsByLocation(state.visibleEvents, state.locations);

    if (state.selectedPlace && !state.groups.some((group) => group.place === state.selectedPlace)) {
      state.selectedPlace = "";
    }

    renderAll();
    if (shouldFit) fitToMarkers();
  }

  function renderAll() {
    renderStatus();
    renderSummary();
    renderColorLegend();
    renderPlaceList();
    renderSidebar();
    renderMap();
  }

  function renderStatus() {
    if (!state.data) {
      showStatus("No GEDCOM loaded");
      return;
    }
    const label = selectedProbandLabel();
    const suffix = label ? ` · proband: ${label}` : "";
    showStatus(`${state.fileName || "GEDCOM"} · ${state.data.individuals.size} people${suffix}`);
  }

  function showStatus(message) {
    el.statusLine.textContent = message;
  }

  function renderSummary() {
    const mapped = eventCountForGroups(state.groups.filter((group) => group.coordinates));
    const unmapped = state.visibleEvents.length - mapped;
    const unmappedPlaces = state.groups.filter((group) => !group.coordinates);
    el.peopleCount.textContent = peopleCountForEvents(state.visibleEvents).toLocaleString();
    el.eventCount.textContent = state.visibleEvents.length.toLocaleString();
    el.mappedCount.textContent = mapped.toLocaleString();
    el.unmappedCount.textContent = unmapped.toLocaleString();
    el.eventBreakdown.textContent = eventBreakdownText(state.visibleEvents);
    el.missingLocationNotice.classList.toggle("hidden", !unmappedPlaces.length);
    el.missingLocationNotice.textContent = unmappedPlaces.length
      ? `${unmappedPlaces.length.toLocaleString()} GEDCOM place name${unmappedPlaces.length === 1 ? " is" : "s are"} missing from the coordinate table. Check the Unmapped list below.`
      : "";
  }

  function eventCountForGroups(groups) {
    return groups.reduce((sum, group) => sum + group.events.length, 0);
  }

  function peopleCountForEvents(events) {
    const people = new Set();
    for (const event of events) {
      for (const personId of event.people || []) {
        if (personId) people.add(personId);
      }
    }
    return people.size;
  }

  function eventBreakdownText(events) {
    if (!events.length) return "";
    const counts = events.reduce(
      (total, event) => {
        total[event.type] = (total[event.type] || 0) + 1;
        return total;
      },
      { birth: 0, marriage: 0, death: 0 },
    );
    return `Births ${counts.birth.toLocaleString()} · Marriages ${counts.marriage.toLocaleString()} · Deaths ${counts.death.toLocaleString()}`;
  }

  function renderColorLegend() {
    if (state.colorMode === "single") {
      el.colorLegend.classList.add("hidden");
      return;
    }

    const context = Core.colorContext(state.visibleEvents, state.singleColor);
    const info = colorLegendInfo(state.colorMode, context);
    el.colorLegend.classList.remove("hidden");
    el.colorLegendTitle.textContent = info.title;
    el.colorLegendRamp.style.background = `linear-gradient(90deg, ${context.palette.join(", ")})`;
    el.colorLegendRamp.classList.toggle("is-muted", !info.usable);
    el.colorLegendMin.textContent = info.minLabel;
    el.colorLegendMax.textContent = info.maxLabel;
    el.colorLegendNote.textContent = info.note;
  }

  function colorLegendInfo(mode, context) {
    if (mode === "time") {
      const same = context.dateCount > 0 && context.minDate === context.maxDate;
      return {
        title: "Event time",
        minLabel: context.minDateLabel || "No date",
        maxLabel: context.maxDateLabel || "No date",
        usable: context.dateCount > 0,
        note: context.dateCount
          ? same
            ? "All dated events share the same date."
            : `${context.dateCount} of ${context.totalEvents} events have dates; location markers use the latest dated event there.`
          : "No dated events are available in the current filter.",
      };
    }

    if (mode === "lineageX") {
      const same = context.lineageXCount > 0 && context.minLineageX === context.maxLineageX;
      return {
        title: "Lineage position",
        minLabel: "Paternal side",
        maxLabel: "Maternal side",
        usable: context.lineageXCount > 0,
        note: context.lineageXCount
          ? same
            ? "All scored events have the same lineage position."
            : `${context.lineageXCount} of ${context.totalEvents} events have lineage positions; location markers average events at that place.`
          : lineageUnavailableNote(),
      };
    }

    const same = context.lineageDepthCount > 0 && context.minDepth === context.maxDepth;
    return {
      title: "Generation depth",
      minLabel: context.lineageDepthCount ? generationLabel(context.minDepth) : "No generation",
      maxLabel: context.lineageDepthCount ? generationLabel(context.maxDepth) : "No generation",
      usable: context.lineageDepthCount > 0,
      note: context.lineageDepthCount
        ? same
          ? `All scored events are ${generationLabel(context.minDepth).toLowerCase()}.`
          : `${context.lineageDepthCount} of ${context.totalEvents} events have generation depths; lower numbers are closer to the proband.`
        : lineageUnavailableNote(),
    };
  }

  function lineageUnavailableNote() {
    return state.data
      ? "No lineage data is available for the current proband and filters."
      : "Load a GEDCOM to compute lineage colors.";
  }

  function generationLabel(depth) {
    return Number(depth) === 0 ? "Generation 0 (proband)" : `Generation ${Number(depth).toLocaleString()}`;
  }

  function renderPlaceList() {
    el.placeList.innerHTML = "";
    const targetMapped = state.placeListMode === "mapped";
    const rows = state.groups
      .filter((group) => Boolean(group.coordinates) === targetMapped)
      .sort((a, b) => b.events.length - a.events.length || a.place.localeCompare(b.place));

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "subtle";
      empty.textContent = targetMapped ? "No mapped locations" : "No unmapped locations";
      el.placeList.append(empty);
      return;
    }

    for (const group of rows) {
      el.placeList.append(renderPlaceRow(group, targetMapped));
    }
  }

  function renderPlaceRow(group, isMapped) {
    const row = document.createElement("div");
    row.className = "place-row";

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = group.place;
    const count = document.createElement("span");
    count.className = "badge";
    count.textContent = `${group.events.length} event${group.events.length === 1 ? "" : "s"}`;
    header.append(title, count);
    row.append(header);

    const grid = document.createElement("div");
    grid.className = "coordinate-grid";
    const lat = document.createElement("input");
    lat.type = "number";
    lat.step = "any";
    lat.min = "-90";
    lat.max = "90";
    lat.placeholder = "Latitude";
    lat.value = group.coordinates ? group.coordinates.lat : "";
    const lng = document.createElement("input");
    lng.type = "number";
    lng.step = "any";
    lng.min = "-180";
    lng.max = "180";
    lng.placeholder = "Longitude";
    lng.value = group.coordinates ? group.coordinates.lng : "";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = isMapped ? "Update" : "Save";
    save.addEventListener("click", () => saveCoordinate(group.place, lat.value, lng.value));
    grid.append(lat, lng, save);
    row.append(grid);

    if (isMapped) {
      const actions = document.createElement("div");
      actions.className = "button-row";
      const select = document.createElement("button");
      select.type = "button";
      select.textContent = "Select";
      select.addEventListener("click", () => selectPlace(group.place));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removeCoordinate(group.place));
      actions.append(select, remove);
      row.append(actions);
    }

    return row;
  }

  function saveCoordinate(place, latValue, lngValue) {
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      showStatus("Coordinates must be valid latitude and longitude values");
      return;
    }
    state.locations[place] = { lat, lng };
    saveStoredLocations(state.locations);
    recalculate(true);
  }

  function removeCoordinate(place) {
    delete state.locations[place];
    saveStoredLocations(state.locations);
    recalculate(true);
  }

  function clearLocations() {
    if (!Object.keys(state.locations).length) return;
    if (!window.confirm("Clear all saved coordinates from this browser?")) return;
    state.locations = {};
    saveStoredLocations(state.locations);
    recalculate(true);
  }

  function renderSidebar() {
    const group = state.groups.find((item) => item.place === state.selectedPlace) || null;
    el.eventList.innerHTML = "";

    if (!group) {
      el.selectedPlaceTitle.textContent = "No location selected";
      el.selectedPlaceMeta.textContent = "Click a marker on the map";
      return;
    }

    el.selectedPlaceTitle.textContent = group.place;
    el.selectedPlaceMeta.textContent = `${group.events.length} event${group.events.length === 1 ? "" : "s"}`;
    const sortedEvents = [...group.events].sort((a, b) => {
      const dateA = a.date && a.date.comparable != null ? a.date.comparable : Number.POSITIVE_INFINITY;
      const dateB = b.date && b.date.comparable != null ? b.date.comparable : Number.POSITIVE_INFINITY;
      return dateA - dateB || a.name.localeCompare(b.name);
    });

    for (const event of sortedEvents) {
      const row = document.createElement("div");
      row.className = "event-row";
      const name = document.createElement("strong");
      name.textContent = event.name;
      const meta = document.createElement("div");
      meta.className = "event-meta";
      const eventLine = document.createElement("span");
      eventLine.textContent = `${event.label} · ${event.dateLabel || "No date"}`;
      const relationLine = document.createElement("span");
      relationLine.textContent = event.relation ? `Relation to proband: ${event.relation}` : "Relation to proband: not in ancestry";
      const placeLine = document.createElement("span");
      placeLine.textContent = event.place;
      meta.append(eventLine, relationLine, placeLine);
      row.append(name, meta);
      el.eventList.append(row);
    }
  }

  function renderMap() {
    const rect = el.mapViewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    el.offlineLayer.setAttribute("width", String(width));
    el.offlineLayer.setAttribute("height", String(height));
    el.offlineLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    el.markerLayer.setAttribute("width", String(width));
    el.markerLayer.setAttribute("height", String(height));
    el.markerLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);

    drawOfflineLayer(width, height);
    renderMarkers(width, height);
  }

  function drawOfflineLayer(width, height) {
    const parts = [];
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#cfe3ee"></rect>`);
    drawBasemap(parts, width, height);

    const longitudeStep = gridStepForZoom(state.view.zoom);
    const latitudeStep = longitudeStep;
    const bounds = screenBounds(width, height);

    for (let lng = Math.floor(bounds.minLng / longitudeStep) * longitudeStep; lng <= bounds.maxLng; lng += longitudeStep) {
      const a = latLngToScreen(clampLat(bounds.minLat), lng, width, height);
      const b = latLngToScreen(clampLat(bounds.maxLat), lng, width, height);
      parts.push(`<line class="map-grid" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`);
      if (a.x > 24 && a.x < width - 24) {
        parts.push(`<text class="map-label" x="${a.x.toFixed(1)}" y="18" text-anchor="middle">${formatLng(lng)}</text>`);
      }
    }

    for (let lat = Math.floor(bounds.minLat / latitudeStep) * latitudeStep; lat <= bounds.maxLat; lat += latitudeStep) {
      const a = latLngToScreen(lat, bounds.minLng, width, height);
      const b = latLngToScreen(lat, bounds.maxLng, width, height);
      parts.push(`<line class="map-grid" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`);
      if (a.y > 18 && a.y < height - 12) {
        parts.push(`<text class="map-label" x="8" y="${(a.y - 4).toFixed(1)}">${formatLat(lat)}</text>`);
      }
    }

    drawMapLabels(parts, width, height, bounds);
    el.offlineLayer.innerHTML = parts.join("");
  }

  function drawBasemap(parts, width, height) {
    if (!state.basemap) return;
    const bounds = paddedScreenBounds(width, height);
    const detailRegions = visibleDetailRegions(bounds);

    if (!detailRegions.length) {
      return;
    }

    for (const region of detailRegions) {
      const level = detailLevelForRegion(region);
      const detailLand = pathForPolygons(level.countries, width, height, bounds, { split: false, close: true });
      const detailWater = pathForPolygons(level.water, width, height, bounds, { split: false, close: true });
      const detailBorders = pathForPolygons(level.countries, width, height, bounds, { split: true, close: false });
      const provinceBorders = pathForPolygons(level.provinces, width, height, bounds, { split: true, close: false });
      if (detailLand) parts.push(`<path class="map-detail-land" d="${detailLand}"></path>`);
      if (detailWater) parts.push(`<path class="map-detail-water" d="${detailWater}"></path>`);
      if (detailBorders) {
        parts.push(`<path class="map-detail-border" d="${detailBorders}"></path>`);
      }
      if (provinceBorders) {
        parts.push(`<path class="map-province-border" d="${provinceBorders}"></path>`);
      }
    }
  }

  function pathForPolygons(polygons, width, height, bounds, options) {
    const settings = {
      split: false,
      close: true,
      ...options,
    };
    const pathParts = [];
    const splitDistance = Math.max(width * 0.55, 360);
    const minPointDistance = pointDistanceForZoom(state.view.zoom);
    for (const polygon of polygons) {
      if (!bboxIntersects(polygon.bbox, bounds)) continue;
      for (const ring of polygon.rings) {
        let open = false;
        let previous = null;
        let lastWritten = null;
        for (let index = 0; index < ring.length; index += 1) {
          const coordinate = ring[index];
          const point = latLngToScreen(coordinate[1], coordinate[0], width, height);
          const isLast = index === ring.length - 1;
          const shouldSkip =
            !isLast &&
            lastWritten &&
            Math.abs(point.x - lastWritten.x) < minPointDistance &&
            Math.abs(point.y - lastWritten.y) < minPointDistance;
          if (shouldSkip) continue;

          const shouldSplit =
            previous &&
            (Math.abs(point.x - previous.x) > splitDistance || Math.abs(point.y - previous.y) > height * 0.9);

          if (!previous || shouldSplit) {
            if (shouldSplit && open && settings.close) pathParts.push("Z");
            pathParts.push(`M${point.x.toFixed(1)},${point.y.toFixed(1)}`);
            open = true;
          } else {
            pathParts.push(`L${point.x.toFixed(1)},${point.y.toFixed(1)}`);
          }
          previous = point;
          lastWritten = point;
        }
        if (open && settings.close && !settings.split) pathParts.push("Z");
      }
    }
    return pathParts.join("");
  }

  function paddedScreenBounds(width, height) {
    const bounds = screenBounds(width, height);
    const latPad = Math.max(2, (bounds.maxLat - bounds.minLat) * 0.15);
    const lngPad = Math.max(2, (bounds.maxLng - bounds.minLng) * 0.15);
    return {
      minLat: Math.max(-90, bounds.minLat - latPad),
      maxLat: Math.min(90, bounds.maxLat + latPad),
      minLng: bounds.minLng - lngPad,
      maxLng: bounds.maxLng + lngPad,
    };
  }

  function bboxIntersects(bbox, bounds) {
    if (!bbox || !bounds) return true;
    if (bounds.maxLng - bounds.minLng >= 320) return true;
    return bbox.maxLat >= bounds.minLat && bbox.minLat <= bounds.maxLat && bbox.maxLng >= bounds.minLng && bbox.minLng <= bounds.maxLng;
  }

  function pointDistanceForZoom(zoom) {
    if (zoom < 3) return 1.1;
    if (zoom < 5) return 0.8;
    if (zoom < 7) return 0.45;
    if (zoom < 9) return 0.2;
    return 0.08;
  }

  function visibleDetailRegions(bounds) {
    if (!state.basemap) return [];
    return state.basemap.regions.filter((region) => bboxIntersects(region.bbox, bounds));
  }

  function detailLevelForRegion(region) {
    const levels = region.levels && region.levels.length ? region.levels : [{ minZoom: 4.4, countries: region.countries || [] }];
    let selected = levels[0];
    for (const level of levels) {
      if (state.view.zoom >= level.minZoom) selected = level;
    }
    return selected;
  }

  function drawMapLabels(parts, width, height, bounds) {
    const placed = [];
    const visibleLabels = [];
    for (const region of visibleDetailRegions(bounds)) {
      for (const label of region.labels || []) {
        if (state.view.zoom < label.minZoom) continue;
        if (label.lat < bounds.minLat || label.lat > bounds.maxLat || label.lng < bounds.minLng || label.lng > bounds.maxLng) continue;
        visibleLabels.push(label);
      }
    }

    visibleLabels.sort((a, b) => (a.rank || 9) - (b.rank || 9) || a.minZoom - b.minZoom || a.name.localeCompare(b.name));

    for (const label of visibleLabels) {
      const point = latLngToScreen(label.lat, label.lng, width, height);
      const labelBounds = cityLabelBounds(label.name, point);
      if (point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
      if (placed.some((item) => rectsOverlap(item, labelBounds))) continue;
      placed.push(labelBounds);
      parts.push(`<circle class="map-city-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.1"></circle>`);
      parts.push(`<text class="map-city-label" x="${(point.x + 5).toFixed(1)}" y="${(point.y - 5).toFixed(1)}">${escapeSvg(label.name)}</text>`);
    }
  }

  function cityLabelBounds(name, point) {
    const textWidth = Math.max(28, String(name).length * 6.4);
    return {
      left: point.x - 4,
      right: point.x + textWidth + 10,
      top: point.y - 18,
      bottom: point.y + 5,
    };
  }

  function rectsOverlap(a, b) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function escapeSvg(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkers(width, height) {
    el.markerLayer.innerHTML = "";
    const mappedGroups = state.groups.filter((group) => group.coordinates);
    el.mapEmpty.classList.toggle("hidden", mappedGroups.length > 0);
    const context = Core.colorContext(state.visibleEvents, state.singleColor);

    for (const group of mappedGroups) {
      const point = latLngToScreen(group.coordinates.lat, group.coordinates.lng, width, height);
      if (point.x < -50 || point.x > width + 50 || point.y < -50 || point.y > height + 50) continue;

      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      marker.classList.add("marker");
      if (group.place === state.selectedPlace) marker.classList.add("is-selected");
      marker.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("role", "button");
      marker.setAttribute("aria-label", `${group.place}, ${group.events.length} events`);

      const radius = Math.max(15, Math.min(30, 12 + Math.sqrt(group.events.length) * 4));
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", String(radius));
      circle.setAttribute("fill", Core.colorForGroup(group, state.colorMode, context));
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.textContent = String(group.events.length);
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${group.place}: ${group.events.length} event${group.events.length === 1 ? "" : "s"}`;

      marker.append(title, circle, text);
      marker.addEventListener("click", () => selectPlace(group.place));
      marker.addEventListener("mouseenter", () => selectPlace(group.place));
      marker.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPlace(group.place);
        }
      });
      el.markerLayer.append(marker);
    }
  }

  function selectPlace(place) {
    state.selectedPlace = place;
    renderSidebar();
    renderMap();
  }

  function fitToMarkers() {
    const mapped = state.groups.filter((group) => group.coordinates);
    if (!mapped.length) {
      state.view = { ...DEFAULT_VIEW };
      renderMap();
      return;
    }

    const rect = el.mapViewport.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(240, rect.height);
    const lats = mapped.map((group) => Number(group.coordinates.lat));
    const lngs = mapped.map((group) => Number(group.coordinates.lng));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    let bestZoom = MIN_ZOOM;

    for (let zoom = 15; zoom >= MIN_ZOOM; zoom -= 0.25) {
      const a = project(maxLat, minLng, zoom);
      const b = project(minLat, maxLng, zoom);
      if (Math.abs(b.x - a.x) <= width - 90 && Math.abs(b.y - a.y) <= height - 90) {
        bestZoom = zoom;
        break;
      }
    }

    state.view = {
      centerLat: clampLat(centerLat),
      centerLng: wrapLng(centerLng),
      zoom: clamp(bestZoom, MIN_ZOOM, 15),
    };
    renderMap();
  }

  function zoomBy(delta) {
    const rect = el.mapViewport.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, state.view.zoom + delta);
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = el.mapViewport.getBoundingClientRect();
    const delta = event.deltaY > 0 ? -0.5 : 0.5;
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, state.view.zoom + delta);
  }

  function zoomAt(screenX, screenY, nextZoom) {
    const rect = el.mapViewport.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const before = screenToLatLng(screenX, screenY, width, height);
    state.view.zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const beforePoint = project(before.lat, before.lng, state.view.zoom);
    const centerPoint = {
      x: beforePoint.x - (screenX - width / 2),
      y: beforePoint.y - (screenY - height / 2),
    };
    const center = unproject(centerPoint.x, centerPoint.y, state.view.zoom);
    state.view.centerLat = center.lat;
    state.view.centerLng = center.lng;
    renderMap();
  }

  function onPointerDown(event) {
    if (event.target.closest(".marker")) return;
    el.mapViewport.setPointerCapture(event.pointerId);
    state.dragging = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      center: project(state.view.centerLat, state.view.centerLng, state.view.zoom),
    };
  }

  function onPointerMove(event) {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.dragging.x;
    const dy = event.clientY - state.dragging.y;
    const center = unproject(state.dragging.center.x - dx, state.dragging.center.y - dy, state.view.zoom);
    state.view.centerLat = center.lat;
    state.view.centerLng = center.lng;
    renderMap();
  }

  function onPointerUp(event) {
    if (state.dragging && state.dragging.pointerId === event.pointerId) {
      state.dragging = null;
    }
  }

  function latLngToScreen(lat, lng, width, height) {
    const center = project(state.view.centerLat, state.view.centerLng, state.view.zoom);
    const point = project(lat, lng, state.view.zoom);
    let dx = point.x - center.x;
    const world = TILE_SIZE * Math.pow(2, state.view.zoom);
    if (dx > world / 2) dx -= world;
    if (dx < -world / 2) dx += world;
    return {
      x: width / 2 + dx,
      y: height / 2 + point.y - center.y,
    };
  }

  function screenToLatLng(x, y, width, height) {
    const center = project(state.view.centerLat, state.view.centerLng, state.view.zoom);
    return unproject(center.x + x - width / 2, center.y + y - height / 2, state.view.zoom);
  }

  function screenBounds(width, height) {
    const corners = [
      screenToLatLng(0, 0, width, height),
      screenToLatLng(width, 0, width, height),
      screenToLatLng(width, height, width, height),
      screenToLatLng(0, height, width, height),
    ];
    return {
      minLat: Math.max(-85, Math.min(...corners.map((corner) => corner.lat))),
      maxLat: Math.min(85, Math.max(...corners.map((corner) => corner.lat))),
      minLng: Math.min(...corners.map((corner) => corner.lng)),
      maxLng: Math.max(...corners.map((corner) => corner.lng)),
    };
  }

  function project(lat, lng, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const clampedLat = clampLat(lat);
    const sin = Math.sin((clampedLat * Math.PI) / 180);
    return {
      x: ((wrapLng(lng) + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  }

  function unproject(x, y, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lng = (x / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return {
      lat: clampLat(lat),
      lng: wrapLng(lng),
    };
  }

  function parseLocationImport(text, fileName) {
    const trimmed = text.trim();
    if (!trimmed) return {};
    if (fileName.toLowerCase().endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return normalizeLocationTable(JSON.parse(trimmed));
    }
    return parseLocationCsv(trimmed);
  }

  function normalizeLocationTable(value) {
    const output = {};
    if (Array.isArray(value)) {
      for (const row of value) {
        const place = String(row.place || row.location || row.name || "").trim();
        if (!place) continue;
        const coordinate = coordinateFrom(row);
        if (coordinate) output[place] = coordinate;
      }
      return output;
    }

    for (const [place, coordinateValue] of Object.entries(value || {})) {
      const coordinate = Array.isArray(coordinateValue)
        ? coordinateFrom({ lat: coordinateValue[0], lng: coordinateValue[1] })
        : coordinateFrom(coordinateValue);
      if (place.trim() && coordinate) output[place.trim()] = coordinate;
    }
    return output;
  }

  function parseLocationCsv(text) {
    const rows = text.split(/\r?\n/).map(parseCsvLine).filter((row) => row.length);
    if (!rows.length) return {};
    const header = rows[0].map((cell) => cell.toLowerCase().trim());
    const hasHeader = header.includes("lat") || header.includes("latitude");
    const placeIndex = hasHeader ? firstIndex(header, ["place", "location", "name"]) : 0;
    const latIndex = hasHeader ? firstIndex(header, ["lat", "latitude"]) : 1;
    const lngIndex = hasHeader ? firstIndex(header, ["lng", "lon", "long", "longitude"]) : 2;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const output = {};

    for (const row of dataRows) {
      const place = String(row[placeIndex] || "").trim();
      const coordinate = coordinateFrom({ lat: row[latIndex], lng: row[lngIndex] });
      if (place && coordinate) output[place] = coordinate;
    }
    return output;
  }

  function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function coordinateFrom(value) {
    const source = value || {};
    const lat = Number(source.lat != null ? source.lat : source.latitude);
    let rawLng = source.lng;
    if (rawLng == null) rawLng = source.lon;
    if (rawLng == null) rawLng = source.long;
    if (rawLng == null) rawLng = source.longitude;
    const lng = Number(rawLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function firstIndex(header, names) {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index !== -1) return index;
    }
    return 0;
  }

  function exportLocations() {
    const blob = new Blob([JSON.stringify(state.locations, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gedver-locations.local.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function loadStoredLocations() {
    try {
      return normalizeLocationTable(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return {};
    }
  }

  function saveStoredLocations(locations) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
    } catch {
      showStatus("Coordinates are active for this session but could not be saved");
    }
  }

  function buildMapData(mapData) {
    if (!mapData || !Array.isArray(mapData.regions) || !mapData.regions.length) return null;
    return {
      regions: (mapData.regions || []).map((region) => ({
        name: region.name,
        bbox: region.bbox,
        countries: region.countries || [],
        levels: mapRegionLevels(region),
        labels: region.labels || [],
      })),
    };
  }

  function mapRegionLevels(region) {
    if (Array.isArray(region.levels) && region.levels.length) {
      return region.levels
        .map((level) => ({
          id: level.id || "detail",
          minZoom: Number(level.minZoom) || 4.4,
          countries: level.countries || [],
          provinces: level.provinces || [],
          water: level.water || [],
        }))
        .sort((a, b) => a.minZoom - b.minZoom);
    }

    return [{ id: "legacy", minZoom: 4.4, countries: region.countries || [], provinces: [], water: [] }];
  }

  function gridStepForZoom(zoom) {
    if (zoom < 2) return 60;
    if (zoom < 3) return 30;
    if (zoom < 5) return 10;
    if (zoom < 7) return 5;
    if (zoom < 9) return 1;
    if (zoom < 12) return 0.25;
    return 0.1;
  }

  function formatLat(lat) {
    const suffix = lat < 0 ? "S" : "N";
    return `${Math.abs(lat).toFixed(Math.abs(lat) < 1 ? 1 : 0)}°${suffix}`;
  }

  function formatLng(lng) {
    const suffix = lng < 0 ? "W" : "E";
    return `${Math.abs(lng).toFixed(Math.abs(lng) < 1 ? 1 : 0)}°${suffix}`;
  }

  function clampLat(lat) {
    return clamp(Number(lat), -85.05112878, 85.05112878);
  }

  function wrapLng(lng) {
    const wrapped = ((((Number(lng) + 180) % 360) + 360) % 360) - 180;
    return wrapped === -180 ? 180 : wrapped;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function debounce(fn, delay) {
    let timer = 0;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  init();
})();
