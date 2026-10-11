(function gedverCoreModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GedverCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function gedverCoreFactory() {
  "use strict";

  const MONTHS = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };

  const EVENT_LABELS = {
    birth: "Birth",
    marriage: "Marriage",
    death: "Death",
  };

  function parseGedcom(text) {
    const records = [];
    const stack = [];
    const lines = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      const parsed = parseLine(rawLine);
      if (!parsed) continue;

      const node = {
        level: parsed.level,
        xref: parsed.xref,
        tag: parsed.tag,
        value: parsed.value,
        children: [],
      };

      while (stack.length && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      if (node.level === 0 || stack.length === 0) {
        records.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }

      stack.push(node);
    }

    const individuals = new Map();
    const families = new Map();
    const submitters = new Map();

    for (const record of records) {
      if (record.tag === "INDI" && record.xref) {
        const individual = parseIndividualRecord(record);
        individuals.set(individual.id, individual);
      }
      if (record.tag === "FAM" && record.xref) {
        const family = parseFamilyRecord(record);
        families.set(family.id, family);
      }
      if (record.tag === "SUBM" && record.xref) {
        const submitter = parseSubmitterRecord(record);
        submitters.set(submitter.id, submitter);
      }
    }

    const childToFamilies = new Map();
    for (const family of families.values()) {
      for (const childId of family.children) {
        if (!childToFamilies.has(childId)) childToFamilies.set(childId, []);
        childToFamilies.get(childId).push(family.id);
      }
    }

    return { records, individuals, families, submitters, childToFamilies };
  }

  function parseLine(rawLine) {
    const line = rawLine.replace(/\r$/, "");
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (!match) return null;
    return {
      level: Number(match[1]),
      xref: match[2] || "",
      tag: match[3].toUpperCase(),
      value: match[4] || "",
    };
  }

  function parseIndividualRecord(record) {
    const id = normalizeXref(record.xref);
    const nameNode = firstChild(record, "NAME");
    const name = parseName(nameNode ? valueWithContinuations(nameNode) : "");
    const sex = (firstChildValue(record, "SEX") || "").trim().toUpperCase();
    const familiesAsChild = children(record, "FAMC").map((node) => normalizeXref(valueWithContinuations(node)));
    const familiesAsSpouse = children(record, "FAMS").map((node) => normalizeXref(valueWithContinuations(node)));

    return {
      id,
      name,
      sex,
      familiesAsChild,
      familiesAsSpouse,
      birth: parseEventNode(firstChild(record, "BIRT")),
      death: parseEventNode(firstChild(record, "DEAT")),
    };
  }

  function parseFamilyRecord(record) {
    const id = normalizeXref(record.xref);
    return {
      id,
      husband: normalizeXref(firstChildValue(record, "HUSB")),
      wife: normalizeXref(firstChildValue(record, "WIFE")),
      children: children(record, "CHIL").map((node) => normalizeXref(valueWithContinuations(node))),
      marriage: parseEventNode(firstChild(record, "MARR")),
    };
  }

  function parseSubmitterRecord(record) {
    const id = normalizeXref(record.xref);
    const name = valueWithContinuations(firstChild(record, "NAME") || { value: "", children: [] });
    return {
      id,
      name: name.replace(/\s+/g, " ").trim(),
    };
  }

  function parseEventNode(node) {
    if (!node) return null;
    const dateRaw = firstChildValue(node, "DATE");
    const place = normalizePlace(firstChildValue(node, "PLAC"));
    return {
      dateRaw,
      date: parseGedcomDate(dateRaw),
      place,
    };
  }

  function parseName(rawName) {
    const raw = String(rawName || "").trim();
    if (!raw) {
      return {
        raw: "",
        given: "",
        surname: "",
        suffix: "",
        display: "(unnamed)",
      };
    }

    const slashMatch = raw.match(/^(.*?)\/(.*?)\/(.*)$/);
    if (!slashMatch) {
      return {
        raw,
        given: raw.replace(/\s+/g, " ").trim(),
        surname: "",
        suffix: "",
        display: raw.replace(/\//g, "").replace(/\s+/g, " ").trim(),
      };
    }

    const given = slashMatch[1].trim();
    const surname = slashMatch[2].trim();
    const suffix = slashMatch[3].trim();
    const display = [given, surname, suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    return {
      raw,
      given,
      surname,
      suffix,
      display: display || "(unnamed)",
    };
  }

  function firstChild(node, tag) {
    return node.children.find((child) => child.tag === tag) || null;
  }

  function children(node, tag) {
    return node.children.filter((child) => child.tag === tag);
  }

  function firstChildValue(node, tag) {
    const child = firstChild(node, tag);
    return child ? valueWithContinuations(child) : "";
  }

  function valueWithContinuations(node) {
    let value = node.value || "";
    for (const child of node.children) {
      if (child.tag === "CONC") value += child.value || "";
      if (child.tag === "CONT") value += "\n" + (child.value || "");
    }
    return value.trim();
  }

  function normalizeXref(value) {
    return String(value || "").trim().replace(/^@|@$/g, "");
  }

  function normalizePlace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseGedcomDate(rawValue) {
    const original = String(rawValue || "").trim();
    if (!original) {
      return emptyDate(original);
    }

    const normalized = original
      .replace(/[,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    let modifier = "";
    let startText = normalized;
    let endText = "";

    const between = normalized.match(/^BET\s+(.+?)\s+AND\s+(.+)$/);
    if (between) {
      modifier = "BET";
      startText = between[1];
      endText = between[2];
    } else {
      const fromTo = normalized.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/);
      if (fromTo) {
        modifier = "FROM";
        startText = fromTo[1];
        endText = fromTo[2];
      } else {
        const from = normalized.match(/^FROM\s+(.+)$/);
        const to = normalized.match(/^TO\s+(.+)$/);
        const qualified = normalized.match(/^(ABT|ABOUT|AFT|AFTER|BEF|BEFORE|CAL|CALCULATED|EST|ESTIMATED|INT|INTERPRETED)\s+(.+)$/);
        if (from) {
          modifier = "FROM";
          startText = from[1];
        } else if (to) {
          modifier = "TO";
          startText = to[1];
        } else if (qualified) {
          modifier = qualified[1];
          startText = qualified[2];
        }
      }
    }

    const start = parseDatePart(startText);
    const end = endText ? parseDatePart(endText) : null;

    return {
      raw: original,
      modifier,
      start,
      end,
      comparable: start ? dateComparable(start) : null,
      display: start ? formatDatePart(start) : original,
      hasDate: Boolean(start),
    };
  }

  function emptyDate(original) {
    return {
      raw: original,
      modifier: "",
      start: null,
      end: null,
      comparable: null,
      display: "",
      hasDate: false,
    };
  }

  function parseDatePart(text) {
    const value = String(text || "")
      .replace(/[()]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (!value) return null;

    let match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{3,4})$/);
    if (match) {
      return makeDatePart(Number(match[3]), Number(match[2]), Number(match[1]));
    }

    match = value.match(/^(\d{3,4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      return makeDatePart(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    const tokens = value.split(" ");
    if (tokens.length === 3 && /^\d{1,2}$/.test(tokens[0]) && MONTHS[tokens[1]] && /^\d{3,4}$/.test(tokens[2])) {
      return makeDatePart(Number(tokens[2]), MONTHS[tokens[1]], Number(tokens[0]));
    }

    if (tokens.length === 2 && MONTHS[tokens[0]] && /^\d{3,4}$/.test(tokens[1])) {
      return makeDatePart(Number(tokens[1]), MONTHS[tokens[0]], null);
    }

    if (/^\d{3,4}$/.test(value)) {
      return makeDatePart(Number(value), null, null);
    }

    return null;
  }

  function makeDatePart(year, month, day) {
    if (!Number.isFinite(year) || year < 1) return null;
    const safeMonth = month == null ? null : clamp(Math.trunc(month), 1, 12);
    const safeDay = day == null ? null : clamp(Math.trunc(day), 1, 31);
    return {
      year: Math.trunc(year),
      month: safeMonth,
      day: safeDay,
      precision: safeDay ? "day" : safeMonth ? "month" : "year",
    };
  }

  function dateComparable(part) {
    return part.year * 372 + (part.month || 1) * 31 + (part.day || 1);
  }

  function formatDatePart(part) {
    const day = part.day == null ? "??" : String(part.day).padStart(2, "0");
    const month = part.month == null ? "??" : String(part.month).padStart(2, "0");
    return `${day}-${month}-${String(part.year).padStart(4, "0")}`;
  }

  function computeAncestry(data, probandId) {
    const result = new Map();
    const cleanProbandId = normalizeXref(probandId);
    if (!cleanProbandId || !data.individuals.has(cleanProbandId)) {
      return result;
    }

    const queue = [{ id: cleanProbandId, depth: 0, pathIndex: 0 }];
    const seenStates = new Set();

    while (queue.length) {
      const state = queue.shift();
      const stateKey = `${state.id}|${state.depth}|${state.pathIndex}`;
      if (seenStates.has(stateKey)) continue;
      seenStates.add(stateKey);

      const x = lineageXForPath(state.depth, state.pathIndex);
      const current = result.get(state.id);
      if (!current || state.depth < current.depth) {
        result.set(state.id, { depth: state.depth, positions: [x] });
      } else if (current.depth === state.depth && !current.positions.includes(x)) {
        current.positions.push(x);
      }

      const parents = getParents(data, state.id);
      if (parents.father) {
        queue.push({ id: parents.father, depth: state.depth + 1, pathIndex: state.pathIndex * 2 });
      }
      if (parents.mother) {
        queue.push({ id: parents.mother, depth: state.depth + 1, pathIndex: state.pathIndex * 2 + 1 });
      }
    }

    for (const value of result.values()) {
      value.x = average(value.positions);
    }

    return result;
  }

  function lineageXForPath(depth, pathIndex) {
    if (depth <= 0) return 0.5;
    const denominator = Math.pow(2, depth) - 1;
    return denominator <= 0 ? 0.5 : pathIndex / denominator;
  }

  function getParents(data, childId) {
    const individual = data.individuals.get(childId);
    const familyIds = new Set(individual ? individual.familiesAsChild : []);
    for (const familyId of data.childToFamilies.get(childId) || []) {
      familyIds.add(familyId);
    }

    for (const familyId of familyIds) {
      const family = data.families.get(familyId);
      if (!family) continue;
      return { father: family.husband, mother: family.wife, familyId };
    }

    return { father: "", mother: "", familyId: "" };
  }

  function extractEvents(data, options) {
    const settings = {
      birth: true,
      marriage: true,
      death: true,
      ancestryOnly: false,
      probandId: "",
      ...options,
    };
    const ancestry = settings.probandId ? computeAncestry(data, settings.probandId) : new Map();
    const useAncestryFilter = Boolean(settings.ancestryOnly && ancestry.size);
    const events = [];

    for (const individual of data.individuals.values()) {
      const included = !useAncestryFilter || ancestry.has(individual.id);
      if (!included) continue;

      if (settings.birth && eventHasPlace(individual.birth)) {
        events.push(makeIndividualEvent("birth", individual, individual.birth, ancestry));
      }
      if (settings.death && eventHasPlace(individual.death)) {
        events.push(makeIndividualEvent("death", individual, individual.death, ancestry));
      }
    }

    for (const family of data.families.values()) {
      if (!settings.marriage || !eventHasPlace(family.marriage)) continue;
      const participantIds = [family.husband, family.wife].filter(Boolean);
      const included = !useAncestryFilter || participantIds.some((id) => ancestry.has(id));
      if (!included) continue;
      events.push(makeFamilyEvent("marriage", family, data, family.marriage, ancestry));
    }

    return { events, ancestry };
  }

  function eventHasPlace(event) {
    return Boolean(event && event.place);
  }

  function makeIndividualEvent(type, individual, event, ancestry) {
    const metric = lineageMetric([individual.id], ancestry);
    return {
      id: `${type}:${individual.id}`,
      type,
      label: EVENT_LABELS[type],
      personId: individual.id,
      familyId: "",
      people: [individual.id],
      name: individual.name.display,
      date: event.date,
      dateLabel: event.date.display,
      place: event.place,
      lineageX: metric.x,
      lineageDepth: metric.depth,
    };
  }

  function makeFamilyEvent(type, family, data, event, ancestry) {
    const people = [family.husband, family.wife].filter(Boolean);
    const names = people.map((id) => {
      const individual = data.individuals.get(id);
      return individual && individual.name ? individual.name.display : "(unnamed)";
    });
    const metric = lineageMetric(people, ancestry);
    return {
      id: `${type}:${family.id}`,
      type,
      label: EVENT_LABELS[type],
      personId: "",
      familyId: family.id,
      people,
      name: names.join(" + ") || "(unnamed)",
      date: event.date,
      dateLabel: event.date.display,
      place: event.place,
      lineageX: metric.x,
      lineageDepth: metric.depth,
    };
  }

  function lineageMetric(ids, ancestry) {
    const metrics = ids.map((id) => ancestry.get(id)).filter(Boolean);
    if (!metrics.length) return { x: null, depth: null };
    const newestDepth = Math.min(...metrics.map((metric) => metric.depth));
    const newest = metrics.filter((metric) => metric.depth === newestDepth);
    return {
      depth: newestDepth,
      x: average(newest.map((metric) => metric.x)),
    };
  }

  function groupEventsByLocation(events, locations) {
    const groups = new Map();
    for (const event of events) {
      const place = normalizePlace(event.place);
      if (!place) continue;
      if (!groups.has(place)) {
        groups.set(place, {
          place,
          events: [],
          coordinates: findCoordinates(place, locations),
          colorValue: null,
        });
      }
      groups.get(place).events.push(event);
    }
    return Array.from(groups.values()).sort((a, b) => a.place.localeCompare(b.place));
  }

  function findCoordinates(place, locations) {
    const table = locations || {};
    const exact = table[place];
    if (isCoordinate(exact)) return exact;
    const lower = place.toLocaleLowerCase();
    const matchingKey = Object.keys(table).find((key) => key.toLocaleLowerCase() === lower);
    return isCoordinate(table[matchingKey]) ? table[matchingKey] : null;
  }

  function isCoordinate(value) {
    return (
      value &&
      Number.isFinite(Number(value.lat)) &&
      Number.isFinite(Number(value.lng)) &&
      Number(value.lat) >= -90 &&
      Number(value.lat) <= 90 &&
      Number(value.lng) >= -180 &&
      Number(value.lng) <= 180
    );
  }

  function groupRepresentativeEvent(group) {
    const dated = group.events
      .filter((event) => event.date && event.date.comparable != null)
      .sort((a, b) => b.date.comparable - a.date.comparable);
    return dated[0] || group.events[0] || null;
  }

  function colorForGroup(group, mode, context) {
    if (mode === "single") return context.singleColor || "#d11f1f";
    const value = colorValueForGroup(group, mode);
    if (value == null) return interpolatePalette(context.palette, 0.5);

    if (mode === "time") {
      return interpolatePalette(context.palette, normalizeBetween(value, context.minDate, context.maxDate));
    }

    if (mode === "lineageX") {
      return interpolatePalette(context.palette, value);
    }

    if (mode === "lineageDepth") {
      return interpolatePalette(context.palette, normalizeBetween(value, context.minDepth, context.maxDepth));
    }

    return context.singleColor || "#d11f1f";
  }

  function colorValueForGroup(group, mode) {
    if (!group || !Array.isArray(group.events)) return null;
    if (mode === "time") {
      const event = groupRepresentativeEvent(group);
      return event && event.date && Number.isFinite(event.date.comparable) ? event.date.comparable : null;
    }
    if (mode === "lineageX") {
      return average(group.events.map((event) => event.lineageX));
    }
    if (mode === "lineageDepth") {
      return average(group.events.map((event) => event.lineageDepth));
    }
    return null;
  }

  function colorContext(events, singleColor) {
    const datedEvents = events
      .filter((event) => event.date && event.date.comparable != null)
      .sort((a, b) => a.date.comparable - b.date.comparable);
    const dates = datedEvents.map((event) => event.date.comparable);
    const lineageXs = events.map((event) => event.lineageX).filter((value) => value != null);
    const depths = events.map((event) => event.lineageDepth).filter((value) => value != null);
    return {
      singleColor,
      totalEvents: events.length,
      dateCount: dates.length,
      lineageXCount: lineageXs.length,
      lineageDepthCount: depths.length,
      minDate: dates.length ? Math.min(...dates) : 0,
      maxDate: dates.length ? Math.max(...dates) : 1,
      minDateLabel: datedEvents.length ? datedEvents[0].date.display : "",
      maxDateLabel: datedEvents.length ? datedEvents[datedEvents.length - 1].date.display : "",
      minLineageX: lineageXs.length ? Math.min(...lineageXs) : null,
      maxLineageX: lineageXs.length ? Math.max(...lineageXs) : null,
      minDepth: depths.length ? Math.min(...depths) : 0,
      maxDepth: depths.length ? Math.max(...depths) : 1,
      palette: ["#2563eb", "#16a34a", "#f59e0b", "#dc2626"],
    };
  }

  function normalizeBetween(value, min, max) {
    if (value == null || !Number.isFinite(value)) return 0.5;
    if (min == null || max == null || min === max) return 0.5;
    return clamp((value - min) / (max - min), 0, 1);
  }

  function interpolatePalette(palette, value) {
    const colors = palette && palette.length ? palette : ["#2563eb", "#dc2626"];
    const t = clamp(value, 0, 1);
    if (colors.length === 1) return colors[0];
    const scaled = t * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    const localT = scaled - index;
    return interpolateColor(colors[index], colors[index + 1], localT);
  }

  function interpolateColor(start, end, amount) {
    const a = hexToRgb(start);
    const b = hexToRgb(end);
    const t = clamp(amount, 0, 1);
    return rgbToHex({
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    });
  }

  function hexToRgb(hex) {
    const clean = String(hex || "").replace("#", "");
    const full = clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean;
    const value = Number.parseInt(full || "000000", 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function rgbToHex(rgb) {
    return `#${[rgb.r, rgb.g, rgb.b].map((part) => clamp(part, 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function average(values) {
    const usable = values.filter((value) => Number.isFinite(value));
    if (!usable.length) return null;
    return usable.reduce((sum, value) => sum + value, 0) / usable.length;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    EVENT_LABELS,
    parseGedcom,
    parseGedcomDate,
    computeAncestry,
    extractEvents,
    groupEventsByLocation,
    groupRepresentativeEvent,
    colorContext,
    colorForGroup,
    colorValueForGroup,
    interpolateColor,
    normalizePlace,
  };
});
